#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { CanvasClient } from './canvas.js';
import { GoogleCalendarClient } from './google-calendar.js';

// Load environment variables
dotenv.config();

// Simple helper to convert Canvas UTC dates to EST
// Canvas returns dates like "2025-11-07T06:59:00Z" (UTC)
// We need to display/create events in EST (America/New_York)
function convertToEST(utcDateString: string | null | undefined): { datetime: string; readable: string } | null {
  // Handle null/undefined dates
  if (!utcDateString) {
    return null;
  }

  try {
    // Parse the UTC date
    const date = new Date(utcDateString);

    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.error(`Invalid date: ${utcDateString}`);
      return null;
    }

    // Get the date/time components in EST using toLocaleString
    const estDateStr = date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    // Parse the formatted string (format: "MM/DD/YYYY, HH:mm:ss")
    // Convert to: "YYYY-MM-DDTHH:mm:ss" for Google Calendar
    const parts = estDateStr.split(', ');
    const datePart = parts[0].split('/'); // [MM, DD, YYYY]
    const timePart = parts[1]; // HH:mm:ss

    const year = datePart[2];
    const month = datePart[0];
    const day = datePart[1];

    const datetime = `${year}-${month}-${day}T${timePart}`;

    // Also create a human-readable version
    const readable = date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    return { datetime, readable };
  } catch (error) {
    console.error('Error converting date to EST:', error, 'Input:', utcDateString);
    return null;
  }
}

// Initialize clients
const canvasClient = new CanvasClient(
  process.env.CANVAS_API_TOKEN!,
  process.env.CANVAS_BASE_URL!
);

const googleClient = new GoogleCalendarClient(
  process.env.GOOGLE_OAUTH_CLIENT_ID!,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
  process.env.GOOGLE_REFRESH_TOKEN || '',
  process.env.GOOGLE_REDIRECT_URI
);

// Create MCP server
const server = new Server(
  {
    name: 'canvas-calendar-bridge',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Google Calendar Authentication
      {
        name: 'get_google_auth_url',
        description: 'Get the Google OAuth authorization URL to authenticate Google Calendar access',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'set_google_auth_code',
        description: 'Exchange the authorization code for access and refresh tokens',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The authorization code from Google OAuth callback',
            },
          },
          required: ['code'],
        },
      },
      // General Calendar Management
      {
        name: 'create_calendar_event',
        description: 'Create a new event in Google Calendar (works for any type of event, not just Canvas-related)',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Event title/summary',
            },
            description: {
              type: 'string',
              description: 'Event description (optional)',
            },
            startTime: {
              type: 'string',
              description: 'Start time in ISO 8601 format (e.g., 2024-01-15T10:00:00)',
            },
            endTime: {
              type: 'string',
              description: 'End time in ISO 8601 format (e.g., 2024-01-15T11:00:00)',
            },
            timezone: {
              type: 'string',
              description: 'Timezone (default: America/New_York)',
            },
          },
          required: ['title', 'startTime', 'endTime'],
        },
      },
      {
        name: 'list_calendar_events',
        description: 'List upcoming events from Google Calendar',
        inputSchema: {
          type: 'object',
          properties: {
            daysAhead: {
              type: 'number',
              description: 'Number of days ahead to retrieve events (default: 7)',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum number of events to return (default: 10)',
            },
          },
        },
      },
      {
        name: 'update_calendar_event',
        description: 'Update an existing calendar event',
        inputSchema: {
          type: 'object',
          properties: {
            eventId: {
              type: 'string',
              description: 'The ID of the event to update',
            },
            title: {
              type: 'string',
              description: 'New event title (optional)',
            },
            description: {
              type: 'string',
              description: 'New event description (optional)',
            },
            startTime: {
              type: 'string',
              description: 'New start time in ISO 8601 format (optional)',
            },
            endTime: {
              type: 'string',
              description: 'New end time in ISO 8601 format (optional)',
            },
            timezone: {
              type: 'string',
              description: 'Timezone (optional)',
            },
          },
          required: ['eventId'],
        },
      },
      {
        name: 'delete_calendar_event',
        description: 'Delete a calendar event',
        inputSchema: {
          type: 'object',
          properties: {
            eventId: {
              type: 'string',
              description: 'The ID of the event to delete',
            },
          },
          required: ['eventId'],
        },
      },
      // Canvas Integration
      {
        name: 'get_canvas_assignments',
        description: 'Get upcoming assignments from Canvas LMS',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'sync_to_calendar',
        description: 'Sync Canvas assignments to Google Calendar',
        inputSchema: {
          type: 'object',
          properties: {
            daysAhead: {
              type: 'number',
              description: 'Number of days ahead to sync (default: 14)',
            },
          },
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // Google Calendar Authentication
      case 'get_google_auth_url': {
        const authUrl = googleClient.getAuthUrl();
        return {
          content: [
            {
              type: 'text',
              text: `Please visit this URL to authorize Google Calendar access:\n\n${authUrl}\n\nAfter authorizing, you'll be redirected to a URL with a 'code' parameter. Copy that code and use the 'set_google_auth_code' tool to complete the authentication.`,
            },
          ],
        };
      }

      case 'set_google_auth_code': {
        const code = args?.code as string;
        if (!code) {
          throw new Error('Authorization code is required');
        }

        const tokens = await googleClient.exchangeCodeForTokens(code);

        return {
          content: [
            {
              type: 'text',
              text: `Authentication successful!\n\nIMPORTANT: Save this refresh token to your configuration:\n\nRefresh Token: ${tokens.refresh_token}\n\nAdd this to your Claude Desktop config (claude_desktop_config.json) under the canvas-calendar-bridge env section:\n"GOOGLE_REFRESH_TOKEN": "${tokens.refresh_token}"\n\nThen restart Claude Desktop for the changes to take effect.`,
            },
          ],
        };
      }

      // General Calendar Management
      case 'create_calendar_event': {
        const title = args?.title as string;
        const description = (args?.description as string) || '';
        const startTime = args?.startTime as string;
        const endTime = args?.endTime as string;
        const timezone = (args?.timezone as string) || 'America/New_York';

        if (!title || !startTime || !endTime) {
          throw new Error('title, startTime, and endTime are required');
        }

        const event = {
          summary: title,
          description: description,
          start: {
            dateTime: startTime,
            timeZone: timezone,
          },
          end: {
            dateTime: endTime,
            timeZone: timezone,
          },
        };

        const createdEvent = await googleClient.createEvent(event);

        return {
          content: [
            {
              type: 'text',
              text: `Calendar event created successfully!\n\nTitle: ${title}\nStart: ${startTime}\nEnd: ${endTime}\nEvent ID: ${createdEvent.id}\nLink: ${createdEvent.htmlLink}`,
            },
          ],
        };
      }

      case 'list_calendar_events': {
        const daysAhead = (args?.daysAhead as number) || 7;
        const maxResults = (args?.maxResults as number) || 10;

        const now = new Date();
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + daysAhead);

        const events = await googleClient.listEvents(
          now.toISOString(),
          futureDate.toISOString(),
          maxResults
        );

        if (!events.items || events.items.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No upcoming events found in the next ${daysAhead} days.`,
              },
            ],
          };
        }

        const eventList = events.items.map((event: any) => {
          const start = event.start.dateTime || event.start.date;
          const end = event.end.dateTime || event.end.date;
          return `• ${event.summary || 'Untitled'}\n  Start: ${start}\n  End: ${end}\n  ID: ${event.id}${event.htmlLink ? `\n  Link: ${event.htmlLink}` : ''}`;
        }).join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${events.items.length} upcoming event(s) in the next ${daysAhead} days:\n\n${eventList}`,
            },
          ],
        };
      }

      case 'update_calendar_event': {
        const eventId = args?.eventId as string;
        if (!eventId) {
          throw new Error('eventId is required');
        }

        const updates: any = {};

        if (args?.title) {
          updates.summary = args.title as string;
        }
        if (args?.description !== undefined) {
          updates.description = args.description as string;
        }
        if (args?.startTime) {
          const timezone = (args?.timezone as string) || 'America/New_York';
          updates.start = {
            dateTime: args.startTime as string,
            timeZone: timezone,
          };
        }
        if (args?.endTime) {
          const timezone = (args?.timezone as string) || 'America/New_York';
          updates.end = {
            dateTime: args.endTime as string,
            timeZone: timezone,
          };
        }

        const updatedEvent = await googleClient.updateEvent(eventId, updates);

        return {
          content: [
            {
              type: 'text',
              text: `Event updated successfully!\n\nEvent ID: ${eventId}\nTitle: ${updatedEvent.summary}\nLink: ${updatedEvent.htmlLink}`,
            },
          ],
        };
      }

      case 'delete_calendar_event': {
        const eventId = args?.eventId as string;
        if (!eventId) {
          throw new Error('eventId is required');
        }

        await googleClient.deleteEvent(eventId);

        return {
          content: [
            {
              type: 'text',
              text: `Event deleted successfully!\n\nEvent ID: ${eventId}`,
            },
          ],
        };
      }

      // Canvas Integration
      case 'get_canvas_assignments': {
        console.error('\n=================================================================================');
        console.error('[get_canvas_assignments] Tool called');
        console.error('=================================================================================');

        const assignments = await canvasClient.getUpcomingAssignments();

        console.error('[get_canvas_assignments] Received assignments from Canvas client:', assignments.length);

        if (!assignments || assignments.length === 0) {
          console.error('[get_canvas_assignments] No assignments returned, sending empty response to user');
          return {
            content: [
              {
                type: 'text',
                text: 'No upcoming assignments or quizzes found in Canvas.',
              },
            ],
          };
        }

        // Debug: Log all assignments to see the structure
        console.error('[get_canvas_assignments] All assignments received:');
        assignments.forEach((item: any, index: number) => {
          console.error(`  Assignment ${index + 1}/${assignments.length}:`, {
            id: item.id,
            title: item.title,
            name: item.name,
            type: item.type,
            due_at: item.due_at,
            start_at: item.start_at,
            points: item.points_possible,
            course: item.context_name,
            has_assignment_obj: !!item.assignment,
            all_keys: Object.keys(item)
          });
        });

        // Format the assignments for better readability (all in EST)
        // Filter out items without valid due dates
        console.error('\n[get_canvas_assignments] Starting formatting and EST conversion...');

        const formatted = assignments
          .map((item: any, index: number) => {
            console.error(`\n[get_canvas_assignments] Processing item ${index + 1}/${assignments.length}:`, item.title || item.name);

            // Canvas upcoming_events can have fields at different levels
            const dueAtField = item.due_at || item.assignment?.due_at;
            const nameField = item.title || item.name || item.assignment?.name;

            console.error(`  - due_at field:`, dueAtField);
            console.error(`  - name field:`, nameField);

            // Only include items with due dates
            if (!dueAtField) {
              console.error(`  - [FILTERED OUT] No due date found`, {
                has_due_at: !!item.due_at,
                has_assignment_due_at: !!item.assignment?.due_at,
                all_keys: Object.keys(item)
              });
              return null;
            }

            // Get type-specific emoji and label
            const typeDisplay: { [key: string]: string } = {
              'assignment': '📚 Assignment',
              'quiz': '📝 Quiz',
              'discussion': '💬 Discussion',
              'event': '📅 Event'
            };

            const itemType = typeDisplay[item.type] || '📄 Unknown';
            console.error(`  - Item type:`, itemType, '(raw:', item.type, ')');

            // Convert UTC date to EST
            console.error(`  - Converting to EST:`, dueAtField);
            const estDate = convertToEST(dueAtField);

            // If conversion failed, skip this item
            if (!estDate) {
              console.error(`  - [FILTERED OUT] EST conversion failed for due_at:`, dueAtField);
              return null;
            }

            console.error(`  - EST conversion successful:`, estDate.readable);

            const formattedItem = {
              type: itemType,
              name: nameField,
              due_date_est: estDate.readable,
              points: item.points_possible || item.assignment?.points_possible || 'N/A',
              course: item.context_name || 'N/A',
              url: item.html_url || item.assignment?.html_url,
              description: item.description ? item.description.substring(0, 100) + '...' : 'No description',
            };

            console.error(`  - [INCLUDED] Successfully formatted item:`, {
              name: formattedItem.name,
              type: formattedItem.type,
              due: formattedItem.due_date_est
            });

            return formattedItem;
          })
          .filter((item: any) => item !== null); // Remove nulls from failed conversions

        console.error('\n[get_canvas_assignments] Formatting complete:');
        console.error('  - Total items received:', assignments.length);
        console.error('  - Successfully formatted:', formatted.length);
        console.error('  - Filtered out:', assignments.length - formatted.length);

        if (formatted.length === 0) {
          console.error('[get_canvas_assignments] No valid items after formatting, sending message to user');
          return {
            content: [
              {
                type: 'text',
                text: 'Found assignments/quizzes but none have valid due dates.',
              },
            ],
          };
        }

        console.error('[get_canvas_assignments] Sending', formatted.length, 'formatted items to user');
        console.error('=================================================================================\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${formatted.length} upcoming item(s) with due dates (times shown in EST):\n\n` + JSON.stringify(formatted, null, 2),
            },
          ],
        };
      }

      case 'sync_to_calendar': {
        console.error('\n=================================================================================');
        console.error('[sync_to_calendar] Tool called with daysAhead:', args?.daysAhead || 14);
        console.error('=================================================================================');

        const daysAhead = (args?.daysAhead as number) || 14;
        const assignments = await canvasClient.getUpcomingAssignments();

        const synced = [];
        const skipped = [];

        console.error('[sync_to_calendar] Total assignments retrieved:', assignments.length);
        console.error('[sync_to_calendar] Days ahead window:', daysAhead);

        if (assignments.length > 0) {
          console.error('\n[sync_to_calendar] First assignment structure (for debugging):');
          console.error(JSON.stringify(assignments[0], null, 2));
        }

        console.error('\n[sync_to_calendar] Starting sync process...\n');

        for (const assignment of assignments) {
          try {
            const assignmentName = assignment.title || assignment.name || 'UNKNOWN';
            console.error(`\n--- Processing: "${assignmentName}" ---`);

            // Debug: Log what fields exist in this assignment
            console.error(`  Fields available:`, {
              has_due_at: !!assignment.due_at,
              has_assignment: !!assignment.assignment,
              due_at_value: assignment.due_at,
              assignment_due_at: assignment.assignment?.due_at,
              type: assignment.type,
              all_keys: Object.keys(assignment)
            });

            // Canvas upcoming_events can have due_at at different levels
            // Check both top-level and nested assignment.due_at
            const dueAtField = assignment.due_at || assignment.assignment?.due_at;
            const nameField = assignment.title || assignment.name || assignment.assignment?.name;

            console.error(`  Due date field:`, dueAtField);
            console.error(`  Name field:`, nameField);

            if (!dueAtField) {
              const skipReason = `${nameField || 'Unknown'} (no due date - checked due_at and assignment.due_at)`;
              console.error(`  [SKIPPED]`, skipReason);
              skipped.push(skipReason);
              continue;
            }

            const dueDateUTC = new Date(dueAtField);
            console.error(`  Parsed UTC date:`, dueDateUTC.toISOString());

            // Validate the date
            if (isNaN(dueDateUTC.getTime())) {
              const skipReason = `${nameField} (invalid due date: ${dueAtField})`;
              console.error(`  [SKIPPED]`, skipReason);
              skipped.push(skipReason);
              continue;
            }

            const now = new Date();
            const daysDiff = Math.ceil((dueDateUTC.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            console.error(`  Days from now:`, daysDiff, '(window:', daysAhead, 'days)');

            if (daysDiff <= daysAhead && daysDiff > 0) {
              console.error(`  [IN WINDOW] Within ${daysAhead} day window, proceeding to create event`);

              // Convert UTC due date to EST
              console.error(`  Converting due date to EST:`, dueAtField);
              const dueEST = convertToEST(dueAtField);

              // Check if conversion succeeded
              if (!dueEST) {
                const skipReason = `${nameField} (date conversion failed)`;
                console.error(`  [SKIPPED]`, skipReason);
                skipped.push(skipReason);
                continue;
              }

              console.error(`  EST due time:`, dueEST.readable);

              // Create event AT the actual due time in EST
              const eventStart = dueEST.datetime;

              // End time: 1 hour after start
              const endDate = new Date(dueDateUTC.getTime() + 60 * 60 * 1000);
              const endEST = convertToEST(endDate.toISOString());

              if (!endEST) {
                const skipReason = `${nameField} (end date conversion failed)`;
                console.error(`  [SKIPPED]`, skipReason);
                skipped.push(skipReason);
                continue;
              }

              const eventEnd = endEST.datetime;
              console.error(`  Event start:`, eventStart);
              console.error(`  Event end:`, eventEnd);

              // Get type-specific info (emoji and label)
              const typeInfo: { [key: string]: { emoji: string; label: string } } = {
                'assignment': { emoji: '📚', label: 'Canvas Assignment' },
                'quiz': { emoji: '📝', label: 'Canvas Quiz' },
                'discussion': { emoji: '💬', label: 'Canvas Discussion' },
                'event': { emoji: '📅', label: 'Calendar Event' }
              };

              const itemInfo = typeInfo[assignment.type] || typeInfo['event'];

              const event = {
                summary: `${itemInfo.emoji} ${nameField}`,
                description: `${itemInfo.label}\n\nDue: ${dueEST.readable} EST\nPoints: ${assignment.points_possible || assignment.assignment?.points_possible || 'N/A'}\nCourse: ${assignment.context_name || 'N/A'}\n\nLink: ${assignment.html_url || assignment.assignment?.html_url || ''}`,
                start: {
                  dateTime: eventStart,
                  timeZone: 'America/New_York',
                },
                end: {
                  dateTime: eventEnd,
                  timeZone: 'America/New_York',
                },
                reminders: {
                  useDefault: false,
                  overrides: [
                    { method: 'popup', minutes: 24 * 60 }, // 1 day before
                    { method: 'popup', minutes: 60 },      // 1 hour before
                  ],
                },
              };

              console.error(`  Creating calendar event with summary: "${event.summary}"`);
              await googleClient.createEvent(event);
              const syncMessage = `${nameField} (${itemInfo.label}) - Due: ${dueEST.readable}`;
              console.error(`  [SYNCED]`, syncMessage);
              synced.push(syncMessage);
            } else {
              const skipReason = `${nameField} (outside ${daysAhead} day window - ${daysDiff} days away)`;
              console.error(`  [SKIPPED]`, skipReason);
              skipped.push(skipReason);
            }
          } catch (error) {
            const itemName = assignment.title || assignment.name || 'Unknown';
            const errorMessage = error instanceof Error ? error.message : 'unknown';
            console.error(`  [ERROR] syncing "${itemName}":`, errorMessage);
            console.error(`  Error details:`, error);
            skipped.push(`${itemName} (error: ${errorMessage})`);
          }
        }

        console.error('\n=================================================================================');
        console.error('[sync_to_calendar] Sync complete:');
        console.error('  - Successfully synced:', synced.length);
        console.error('  - Skipped:', skipped.length);
        console.error('=================================================================================\n');

        let resultText = `Successfully synced ${synced.length} item(s) to Google Calendar (EST timezone):\n\n`;
        if (synced.length > 0) {
          resultText += synced.join('\n');
        }
        if (skipped.length > 0) {
          resultText += `\n\nSkipped ${skipped.length} item(s):\n${skipped.join('\n')}`;
        }

        return {
          content: [
            {
              type: 'text',
              text: resultText,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Canvas Calendar Bridge MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
