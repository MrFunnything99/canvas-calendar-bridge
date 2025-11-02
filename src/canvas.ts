// Canvas API integration

export class CanvasClient {
  private apiToken: string;
  private domain: string;

  constructor(apiToken: string, domain: string) {
    this.apiToken = apiToken;
    this.domain = domain;
  }

  private async fetch(endpoint: string, timeoutMs: number = 30000) {
    const url = `${this.domain}/api/v1${endpoint}`;
    console.error('[Canvas API] Calling URL:', url);
    console.error('[Canvas API] Timeout:', timeoutMs, 'ms');

    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('[Canvas API] REQUEST TIMEOUT - Aborting after', timeoutMs, 'ms');
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorMsg = `Canvas API error: ${response.status} ${response.statusText}`;
        console.error('[Canvas API] HTTP ERROR:', errorMsg);
        throw new Error(errorMsg);
      }

      console.error('[Canvas API] Response received successfully');
      const data = await response.json();
      console.error('[Canvas API] Data parsed, items count:', Array.isArray(data) ? data.length : 'N/A (not an array)');

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          const timeoutError = `Canvas API timeout after ${timeoutMs}ms for ${url}`;
          console.error('[Canvas API] TIMEOUT ERROR:', timeoutError);
          throw new Error(timeoutError);
        }
        console.error('[Canvas API] FETCH ERROR:', error.message);
      } else {
        console.error('[Canvas API] UNKNOWN ERROR:', error);
      }

      throw error;
    }
  }

  // Detect the type of Canvas item (assignment, quiz, discussion, or calendar event)
  private detectItemType(event: any): string {
    // Check if it's a quiz (either has quiz_id or submission type is online_quiz)
    if (event.assignment?.quiz_id || event.assignment?.submission_types?.includes('online_quiz')) {
      return 'quiz';
    }

    // Check if it's a discussion
    if (event.assignment?.discussion_topic || event.assignment?.submission_types?.includes('discussion_topic')) {
      return 'discussion';
    }

    // Check if it's an assignment
    if (event.assignment || event.type === 'assignment') {
      return 'assignment';
    }

    // Otherwise it's a calendar event
    return 'event';
  }

  // Get all upcoming Canvas items (assignments, quizzes, discussions, events)
  async getUpcomingAssignments() {
    try {
      console.error('=================================================================================');
      console.error('=== CANVAS API DEBUG START ===');
      console.error('=================================================================================');

      const now = new Date();
      console.error('[Canvas API] Current time:', now.toISOString());

      // Step 1: Get all active courses (any enrollment type - student, teacher, ta, etc.)
      console.error('\n[Canvas API] Step 1: Fetching active courses...');
      const coursesEndpoint = '/courses?enrollment_state=active';
      console.error('[Canvas API] Courses endpoint:', coursesEndpoint);
      const courses = await this.fetch(coursesEndpoint);
      console.error('[Canvas API] Active courses found:', courses.length);

      if (courses.length > 0) {
        console.error('[Canvas API] Courses:');
        courses.forEach((course: any) => {
          console.error(`  - ${course.name} (ID: ${course.id})`);
        });
      } else {
        console.error('[Canvas API] WARNING: No active courses found!');
      }

      // Step 2: Get assignments from each course
      console.error('\n[Canvas API] Step 2: Fetching assignments from each course...');
      const allAssignments: any[] = [];
      const failedCourses: string[] = [];

      for (const course of courses) {
        console.error(`\n[Canvas API] Fetching assignments for course: ${course.name} (ID: ${course.id})`);
        try {
          const assignmentsEndpoint = `/courses/${course.id}/assignments`;
          const assignments = await this.fetch(assignmentsEndpoint);
          console.error(`[Canvas API]   ✓ SUCCESS - Found ${assignments.length} assignments in ${course.name}`);

          // Add course context to each assignment
          assignments.forEach((assignment: any) => {
            assignment.course_name = course.name;
            assignment.course_id = course.id;
          });

          allAssignments.push(...assignments);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[Canvas API]   ✗ FAILED - Error fetching assignments for ${course.name}:`, errorMsg);
          console.error(`[Canvas API]   ✗ Full error:`, error);
          failedCourses.push(`${course.name}: ${errorMsg}`);
          // DO NOT CONTINUE - Re-throw the error to fail fast
          throw new Error(`Failed to fetch assignments for course "${course.name}": ${errorMsg}`);
        }
      }

      if (failedCourses.length > 0) {
        console.error('\n[Canvas API] WARNING: Some courses failed to load:');
        failedCourses.forEach(msg => console.error(`  - ${msg}`));
      }

      console.error('\n[Canvas API] Total assignments from all courses:', allAssignments.length);

      // Step 3: Filter for published assignments with due dates
      console.error('\n[Canvas API] Step 3: Filtering for published assignments with due dates...');
      const events = allAssignments.filter((assignment: any) => {
        const isPublished = assignment.published === true;
        const hasDueDate = !!assignment.due_at;

        if (!isPublished) {
          console.error(`[Canvas API]   - Filtered out "${assignment.name}": not published`);
        } else if (!hasDueDate) {
          console.error(`[Canvas API]   - Filtered out "${assignment.name}": no due date`);
        } else {
          console.error(`[Canvas API]   - Included "${assignment.name}": published with due date`);
        }

        return isPublished && hasDueDate;
      });

      console.error('[Canvas API] Total events received:', events.length);

      // Log the RAW response for the first few items
      if (events.length > 0) {
        console.error('=================================================================================');
        console.error('[Canvas API] RAW JSON RESPONSE (first 3 items):');
        console.error('=================================================================================');
        events.slice(0, 3).forEach((event: any, index: number) => {
          console.error(`\n--- RAW Event ${index + 1} ---`);
          console.error(JSON.stringify(event, null, 2));
        });
        console.error('=================================================================================');
      }

      // Log detailed summary of all events
      if (events.length > 0) {
        console.error('\n=================================================================================');
        console.error('[Canvas API] SUMMARY OF ALL EVENTS:');
        console.error('=================================================================================');
        events.forEach((event: any, index: number) => {
          console.error(`\nEvent ${index + 1}/${events.length}:`, {
            id: event.id,
            title: event.title,
            type: event.type,
            start_at: event.start_at,
            end_at: event.end_at,
            all_day: event.all_day,
            workflow_state: event.workflow_state,
            context_name: event.context_name,
            has_assignment: !!event.assignment,
            assignment_due_at: event.assignment?.due_at,
            assignment_quiz_id: event.assignment?.quiz_id,
            assignment_submission_types: event.assignment?.submission_types,
            assignment_points_possible: event.assignment?.points_possible,
            all_top_level_keys: Object.keys(event),
            assignment_keys: event.assignment ? Object.keys(event.assignment) : []
          });
        });
        console.error('=================================================================================');
      }

      // Count items with and without start_at
      const withStartAt = events.filter((e: any) => e.start_at).length;
      const withoutStartAt = events.filter((e: any) => !e.start_at).length;
      console.error('\n[Canvas API] Date field analysis:');
      console.error('  - Items with start_at:', withStartAt);
      console.error('  - Items without start_at:', withoutStartAt);

      // Step 4: Transform to consistent format with type detection
      console.error('\n=================================================================================');
      console.error('[Canvas API] Step 4: TRANSFORMATION:');
      console.error('=================================================================================');

      const transformed = events.map((assignment: any) => {
        // Determine type based on assignment properties
        let itemType: string;
        if (assignment.is_quiz_assignment || assignment.quiz_id) {
          itemType = 'quiz';
          console.error(`[TYPE DETECTION] "${assignment.name}": QUIZ (has quiz_id: ${assignment.quiz_id})`);
        } else if (assignment.submission_types?.includes('discussion_topic')) {
          itemType = 'discussion';
          console.error(`[TYPE DETECTION] "${assignment.name}": DISCUSSION`);
        } else {
          itemType = 'assignment';
          console.error(`[TYPE DETECTION] "${assignment.name}": ASSIGNMENT`);
        }

        const transformedItem = {
          id: assignment.id,
          title: assignment.name,
          name: assignment.name,
          type: itemType,
          due_at: assignment.due_at,
          start_at: assignment.due_at, // Use due_at as start_at for compatibility
          end_at: assignment.due_at,
          all_day: false,
          description: assignment.description || '',
          points_possible: assignment.points_possible,
          context_name: assignment.course_name,
          context_code: `course_${assignment.course_id}`,
          workflow_state: assignment.workflow_state,
          html_url: assignment.html_url,
          assignment: assignment, // Include full assignment data
        };

        console.error(`[TRANSFORMED] "${assignment.name}":`, {
          id: transformedItem.id,
          type: transformedItem.type,
          due_at: transformedItem.due_at,
          points: transformedItem.points_possible,
          course: transformedItem.context_name
        });

        return transformedItem;
      });

      console.error('\n=================================================================================');
      console.error('[Canvas API] FINAL RESULTS:');
      console.error('  - Raw events from API:', events.length);
      console.error('  - After filtering:', transformed.length);
      console.error('  - Filtered out:', events.length - transformed.length);
      console.error('=================================================================================');
      console.error('=== CANVAS API DEBUG END ===');
      console.error('=================================================================================\n');

      return transformed;
    } catch (error) {
      console.error('=================================================================================');
      console.error('[Canvas API] ERROR:', error);
      console.error('=================================================================================');
      throw error;
    }
  }


  async getCourses() {
    try {
      return await this.fetch('/courses?enrollment_state=active');
    } catch (error) {
      console.error('Error fetching courses:', error);
      throw error;
    }
  }

  async getAssignmentsByCourse(courseId: number) {
    try {
      return await this.fetch(`/courses/${courseId}/assignments`);
    } catch (error) {
      console.error(`Error fetching assignments for course ${courseId}:`, error);
      throw error;
    }
  }

  async getCalendarEvents(startDate?: string, endDate?: string) {
    try {
      let endpoint = '/calendar_events?context_codes[]=user_1';
      if (startDate) endpoint += `&start_date=${startDate}`;
      if (endDate) endpoint += `&end_date=${endDate}`;
      return await this.fetch(endpoint);
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      throw error;
    }
  }
}
