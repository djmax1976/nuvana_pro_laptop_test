# Develop Story - Workflow Instructions

```xml
<critical>The workflow execution engine is governed by: {project-root}/nuvana_control/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {installed_path}/workflow.yaml</critical>
<critical>Communicate all responses in {communication_language} and language MUST be tailored to {user_skill_level}</critical>
<critical>Generate all documents in {document_output_language}</critical>
<critical>Only modify the story file in these areas: Tasks/Subtasks checkboxes, Dev Agent Record (Debug Log, Completion Notes), File List, Change Log, and Status</critical>
<critical>Execute ALL steps in exact order; do NOT skip steps</critical>
<critical>Absolutely DO NOT stop because of "milestones", "significant progress", or "session boundaries". Continue in a single execution until the story is COMPLETE (all ACs satisfied and all tasks/subtasks checked) UNLESS a HALT condition is triggered or the USER gives other instruction.</critical>
<critical>Do NOT schedule a "next session" or request review pauses unless a HALT condition applies. Only Step 6 decides completion.</critical>

<critical>User skill level ({user_skill_level}) affects conversation style ONLY, not code updates.</critical>

<workflow>

  <step n="0" goal="Preflight validation - MCP server availability">
    <critical>BLOCKING GATE: When use_mcp_coding_guidelines is true, MCP coding-rules server MUST be available before starting story implementation</critical>

    <check if="{{use_mcp_coding_guidelines}} == false">
      <output>ℹ️ MCP Coding-Rules Integration: DISABLED

**Configuration:** use_mcp_coding_guidelines = false
**Code Quality:** Basic (context file standards only)
**Security Validation:** Limited (no automated MCP scanning)

Continuing without MCP integration...
      </output>
    </check>

    <check if="{{use_mcp_coding_guidelines}} == true">
      <action>Initialize MCP failure tracking: {{mcp_failures}} = empty list</action>
      <action>Test MCP coding-rules server availability by calling get_coding_patterns with task_type='test' and context='preflight-check'</action>
      <action>Verify MCP server responds with valid coding patterns</action>

      <check if="MCP server does NOT respond OR returns error">
        <output>🚨 BLOCKING VALIDATION FAILURE: MCP Coding-Rules Server Not Available

**Issue:** use_mcp_coding_guidelines is true but MCP server is unreachable

**Why This Blocks:**
Running without MCP means NO security validation (SQL injection, XSS, CSRF) and NO enterprise coding patterns.

**Required Actions (Choose One):**

**Option A: Fix MCP (Recommended)**
1. Install: `npm install -g coding-rules`
2. Configure Claude Code: See nuvana_control/nuvana_mcp/coding_rules/AI_TOOLS_CONFIG.md
3. Restart Claude Code
4. Re-run this workflow

**Option B: Disable MCP (Lower Quality)**
1. Edit workflow.yaml: Set `use_mcp_coding_guidelines: false`
2. Re-run workflow
3. NOTE: Story will lack enterprise standards and security validation

**HALT REASON:** MCP server required (use_mcp_coding_guidelines=true) but not available
        </output>
        <action>HALT workflow execution - MCP must be available or disabled in configuration</action>
      </check>

      <output>✅ MCP Coding-Rules Server: AVAILABLE

Enterprise coding standards and security validation ENABLED.
Proceeding with MCP-guided implementation...
      </output>
    </check>
  </step>

  <step n="1" goal="Find next ready story and load it" tag="sprint-status">
    <check if="{{story_path}} is provided">
      <action>Use {{story_path}} directly</action>
      <action>Read COMPLETE story file</action>
      <action>Extract story_key from filename or metadata</action>
      <goto>task_check</goto>
    </check>

    <critical>MUST read COMPLETE sprint-status.yaml file from start to end to preserve order</critical>
    <action>Load the FULL file: {{output_sprint_status_folder}}/sprint-status.yaml</action>
    <action>Read ALL lines from beginning to end - do not skip any content</action>
    <action>Parse the development_status section completely to understand story order</action>

    <action>Find the FIRST story (by reading in order from top to bottom) where:
      - Key matches pattern: number-number-name (e.g., "1-2-user-auth")
      - NOT an epic key (epic-X) or retrospective (epic-X-retrospective)
      - Status value equals "ready-for-dev"
    </action>

    <check if="no ready-for-dev or in-progress story found">
      <output>📋 No ready-for-dev stories found in sprint-status.yaml
**Options:**
1. Run `create_story_context` to generate context file and mark drafted stories as ready
2. Run `create-story` if no incomplete stories are drafted yet
3. Check {output_sprint_status_folder}/sprint-status.yaml to see current sprint status
      </output>
      <action>HALT</action>
    </check>

    <action>Store the found story_key (e.g., "1-2-user-authentication") for later status updates</action>
    <action>Find matching story file in {{story_dir}} using story_key pattern: {{story_key}}.md</action>
    <action>Read COMPLETE story file from discovered path</action>

    <anchor id="task_check" />

    <action>Parse sections: Story, Acceptance Criteria, Tasks/Subtasks, Dev Notes, Dev Agent Record, File List, Change Log, Status</action>

    <action>Check if context file exists at: {{context_file}}</action>
    <check if="context file exists">
      <action>Read COMPLETE context file</action>
      <action>Parse all sections: story details, artifacts (docs, code, dependencies), interfaces, constraints, tests</action>
      <action>Use this context to inform implementation decisions and approaches</action>
    </check>
    <check if="context file does NOT exist">
      <output>ℹ️ No context file found for {{story_key}}

Proceeding with story file only. For better context, consider running `story-context` workflow first.
      </output>
    </check>

    <action>Extract story_id from story_key (epic-story numbers only, e.g., "1-3" from "1-3-database-setup-with-prisma")</action>
    <action>Construct ATDD checklist file path: {{test_checklists_folder}}/atdd-checklist-{{story_id}}.md</action>
    <action>Check if ATDD checklist file exists at the constructed path</action>
    <check if="ATDD checklist file exists">
      <action>Read COMPLETE ATDD checklist file</action>
      <action>Parse sections: Story Summary, Acceptance Criteria, Failing Tests, Implementation Checklist, Red-Green-Refactor Workflow</action>
      <action>Extract implementation checklist tasks organized by test priority (P0 → P1 → P2)</action>
      <action>Store checklist content for use in implementation steps</action>
      <output>📋 **ATDD Checklist Found**

Using implementation checklist from: {{atdd_checklist_file}}

**Available Guidance:**
- Implementation tasks for each failing test
- Priority-based task ordering (P0 → P1 → P2)
- Step-by-step instructions to make tests pass
- Red-Green-Refactor workflow guidance

The checklist will guide implementation to ensure tests pass (RED → GREEN phase).
      </output>
    </check>
    <check if="ATDD checklist file does NOT exist">
      <output>ℹ️ No ATDD checklist found for {{story_key}}

Proceeding with story file tasks only. For test-driven development, consider running `create-tests` workflow first to generate ATDD checklist.
      </output>
    </check>

    <action>Identify first incomplete task (unchecked [ ]) in Tasks/Subtasks</action>

    <action if="no incomplete tasks"><goto step="6">Completion sequence</goto></action>
    <action if="story file inaccessible">HALT: "Cannot develop story without access to story file"</action>
    <action if="incomplete task or subtask requirements ambiguous">ASK user to clarify or HALT</action>
  </step>

  <step n="1.5" goal="Detect review continuation and extract review context">
    <critical>Determine if this is a fresh start or continuation after code review</critical>

    <action>Check if "Senior Developer Review (AI)" section exists in the story file</action>
    <action>Check if "Review Follow-ups (AI)" subsection exists under Tasks/Subtasks</action>

    <check if="Senior Developer Review section exists">
      <action>Set review_continuation = true</action>
      <action>Extract from "Senior Developer Review (AI)" section:
        - Review outcome (Approve/Changes Requested/Blocked)
        - Review date
        - Total action items with checkboxes (count checked vs unchecked)
        - Severity breakdown (High/Med/Low counts)
      </action>
      <action>Count unchecked [ ] review follow-up tasks in "Review Follow-ups (AI)" subsection</action>
      <action>Store list of unchecked review items as {{pending_review_items}}</action>

      <output>⏯️ **Resuming Story After Code Review** ({{review_date}})

**Review Outcome:** {{review_outcome}}
**Action Items:** {{unchecked_review_count}} remaining to address
**Priorities:** {{high_count}} High, {{med_count}} Medium, {{low_count}} Low

**Strategy:** Will prioritize review follow-up tasks (marked [AI-Review]) before continuing with regular tasks.
      </output>
    </check>

    <check if="Senior Developer Review section does NOT exist">
      <action>Set review_continuation = false</action>
      <action>Set {{pending_review_items}} = empty</action>

      <output>🚀 **Starting Fresh Implementation**

Story: {{story_key}}
Context file: {{context_available}}
First incomplete task: {{first_task_description}}
      </output>
    </check>
  </step>

  <step n="1.6" goal="Mark story in-progress" tag="sprint-status">
    <action>Load the FULL file: {{output_sprint_status_folder}}/sprint-status.yaml</action>
    <action>Read all development_status entries to find {{story_key}}</action>
    <action>Get current status value for development_status[{{story_key}}]</action>

    <check if="current status == 'ready-for-dev'">
      <action>Update the story in the sprint status report to = "in-progress"</action>
      <output>🚀 Starting work on story {{story_key}}
Status updated: ready-for-dev → in-progress
      </output>
    </check>

    <check if="current status == 'in-progress'">
      <output>⏯️ Resuming work on story {{story_key}}
Story is already marked in-progress
      </output>
    </check>

    <check if="current status is neither ready-for-dev nor in-progress">
      <output>⚠️ Unexpected story status: {{current_status}}
Expected ready-for-dev or in-progress. Continuing anyway...
      </output>
    </check>
  </step>

  <step n="2" goal="Plan and implement task">
    <critical>PROGRESSIVE CHECKBOX MARKING: Each subtask checkbox MUST be marked [x] and saved IMMEDIATELY upon completion (not deferred to Step 5). This provides real-time visibility into implementation progress.</critical>

    <action>Review acceptance criteria and dev notes for the selected task</action>
    <action>Parse the task to identify ALL subtasks (checklist items under the main task)</action>
    <action>Create subtask list with individual descriptions and requirements</action>
    <action>Plan overall task implementation strategy; write down a brief plan in Dev Agent Record → Debug Log</action>

    <!-- ============ ATDD CHECKLIST INTEGRATION - START ============ -->
    <check if="ATDD checklist was loaded in Step 1">
      <action>Review implementation checklist from ATDD checklist for tasks related to current story task</action>
      <action>Prioritize checklist tasks by test priority (P0 tests first, then P1, then P2)</action>
      <action>Match story task to corresponding checklist test implementation tasks</action>
      <action>Use checklist tasks as supplementary guidance alongside story file tasks</action>
      <action>Follow checklist step-by-step instructions to make tests pass (RED → GREEN)</action>
      <action>Add to Dev Agent Record → Debug Log: "Using ATDD checklist guidance for test-driven implementation"</action>
      <note>Checklist provides test-specific implementation tasks. Story file tasks remain primary, checklist provides test verification guidance.</note>
    </check>
    <!-- ============ ATDD CHECKLIST INTEGRATION - END ============ -->

    <!-- ============ SUBTASK IMPLEMENTATION LOOP - START ============ -->
    <!-- ╔══════════════════════════════════════════════════════════════════════════════╗ -->
    <!-- ║  🚨🚨🚨 CRITICAL ENFORCEMENT: MCP CONSULTATION IS MANDATORY PER SUBTASK 🚨🚨🚨  ║ -->
    <!-- ╠══════════════════════════════════════════════════════════════════════════════╣ -->
    <!-- ║  This is the MOST IMPORTANT section of the entire workflow.                    ║ -->
    <!-- ║  Security vulnerabilities are introduced when MCP is skipped.                  ║ -->
    <!-- ║  You MUST call MCP tools for EVERY CODE_IMPLEMENTATION subtask.                ║ -->
    <!-- ║  NO EXCEPTIONS. NO SHORTCUTS. NO "I'll do it later".                          ║ -->
    <!-- ╚══════════════════════════════════════════════════════════════════════════════╝ -->

    <critical>🚨 MANDATORY: Process EACH subtask INDIVIDUALLY with MCP consultation - NO BATCHING, NO SKIPPING</critical>
    <critical>🚨 BLOCKING: You MUST NOT write ANY code until you have called get_coding_patterns for that subtask</critical>
    <critical>🚨 BLOCKING: You MUST NOT mark a subtask complete until you have called validate_code for that subtask</critical>

    <action>FOR EACH subtask in the subtask list, execute the following subtask implementation sequence:</action>

      <!-- ============ INTELLIGENT SUBTASK CLASSIFICATION - START ============ -->
      <critical>🔍 MANDATORY STEP 1: Classify subtask to determine MCP consultation requirements</critical>
      <action>Read and analyze the complete subtask description carefully</action>
      <action>Classify the subtask into one of these categories based on its nature:

**CODE_IMPLEMENTATION** - Requires MCP coding-rules consultation:
  - Implementing API endpoints, routes, or controllers
  - Writing database queries, models, schemas, or migrations with business logic
  - Creating React/UI components with state management or complex logic
  - Implementing authentication, authorization, or security features
  - Building forms with validation and data processing
  - Implementing file upload/download functionality
  - Writing business logic, data transformations, or algorithms
  - Creating middleware or request/response handlers
  - Implementing payment processing or external API integrations
  - Adding error handling with security implications
  - Writing utility functions with validation or sanitization

**ADMINISTRATIVE** - Does NOT require MCP (skip MCP consultation):
  - Updating documentation, README files, or comments
  - Creating directories, folder structures, or placeholder files
  - Installing dependencies (npm install, package updates)
  - Running database migrations (execution only, not writing them)
  - Updating configuration files without security implications (.gitignore, .env.example)
  - Organizing or renaming existing files
  - Deleting unused files or code
  - Simple Git operations
  - Reading or reviewing existing code without modifications
  - Setting up project scaffolding or boilerplate

**TESTING** - May require test-specific MCP consultation:
  - Writing unit tests, integration tests, or e2e tests
  - Creating test fixtures or mock data
  - Setting up test infrastructure

      </action>
      <action>Set {{subtask_category}} to the determined classification</action>
      <action>🔊 OUTPUT TO USER: "📋 Subtask {{subtask_number}}: {{subtask_description}} - Classified as {{subtask_category}}"</action>
      <action>Add to Dev Agent Record → Debug Log: "📋 Subtask {{subtask_number}} Classification: {{subtask_category}} - {{subtask_description}}"</action>
      <!-- ============ INTELLIGENT SUBTASK CLASSIFICATION - END ============ -->

      <!-- ============ MCP CODING GUIDELINES INTEGRATION - SUBTASK LEVEL - START ============ -->
      <!-- ╔════════════════════════════════════════════════════════════════════════════════════╗ -->
      <!-- ║  🚨 MANDATORY MCP CONSULTATION SEQUENCE FOR CODE_IMPLEMENTATION SUBTASKS 🚨          ║ -->
      <!-- ║                                                                                      ║ -->
      <!-- ║  BEFORE WRITING ANY CODE, YOU MUST:                                                 ║ -->
      <!-- ║    1. Call get_coding_patterns() - Get implementation patterns                      ║ -->
      <!-- ║    2. Call get_full_rule_details() - For EACH rule mentioned in patterns            ║ -->
      <!-- ║    3. Announce the guidance to the user                                              ║ -->
      <!-- ║                                                                                      ║ -->
      <!-- ║  AFTER WRITING CODE, YOU MUST:                                                      ║ -->
      <!-- ║    4. Call validate_code() - Validate the implemented code                          ║ -->
      <!-- ║    5. Fix ANY high severity issues before marking complete                          ║ -->
      <!-- ║                                                                                      ║ -->
      <!-- ║  FAILURE TO FOLLOW THIS SEQUENCE = SECURITY VULNERABILITIES                         ║ -->
      <!-- ╚════════════════════════════════════════════════════════════════════════════════════╝ -->

      <check if="{{use_mcp_coding_guidelines}} == true AND {{subtask_category}} == 'CODE_IMPLEMENTATION'">

        <!-- ═══════════════════════════════════════════════════════════════════════════════ -->
        <!-- 🚨 PHASE 1: PRE-IMPLEMENTATION MCP CONSULTATION (MANDATORY - BLOCKING) 🚨      -->
        <!-- ═══════════════════════════════════════════════════════════════════════════════ -->
        <critical>🛑 STOP! DO NOT WRITE ANY CODE YET. FIRST CONSULT MCP.</critical>

        <action>📝 STEP 1A: Extract subtask keywords to determine task_type</action>
        <action>Determine subtask_type from keywords: 'api', 'database', 'form', 'display', 'authentication', 'authorization', 'component', 'validation', 'security', 'middleware', 'service', etc.</action>
        <action>Extract additional context from subtask (e.g., 'authentication', 'validation', 'file-upload', 'security', 'error-handling', 'password', 'jwt', 'session')</action>

        <action>📝 STEP 1B: CALL get_coding_patterns MCP TOOL NOW</action>
        <mandate>🚨 MANDATORY MCP CALL: Use mcp__coding-rules__get_coding_patterns with task_type='{{detected_subtask_type}}' and context='{{subtask_additional_context}}'</mandate>
        <action>🔊 OUTPUT TO USER: "🔍 Consulting MCP coding-rules for subtask {{subtask_number}}..."</action>
        <action>WAIT for MCP response before proceeding</action>
        <action>Parse and extract from get_coding_patterns response:
          - All implementation patterns listed
          - Rule IDs mentioned (e.g., SEC-001, API-002, etc.)
          - Rule keywords mentioned (e.g., PASSWORD_HASHING, SQL_INJECTION, RATE_LIMIT)
          - Security best practices
          - Error handling standards
        </action>
        <action>🔊 OUTPUT TO USER: "📋 MCP returned {{pattern_count}} patterns for {{subtask_type}}/{{context}}"</action>

        <action>📝 STEP 1C: CALL get_full_rule_details FOR EACH RELEVANT RULE</action>
        <mandate>🚨 MANDATORY: For EACH rule keyword identified, call mcp__coding-rules__get_full_rule_details</mandate>
        <action>Identify rule keywords from get_coding_patterns response (e.g., 'PASSWORD_HASHING', 'SQL_INJECTION', 'TENANT_ISOLATION', 'XSS', 'CSRF', 'RATE_LIMIT')</action>
        <action>FOR EACH identified rule_keyword:</action>
        <action>  - Call mcp__coding-rules__get_full_rule_details with keyword='{{rule_keyword}}'</action>
        <action>  - Extract: Implementation guidance, verification steps, AI checklist, code examples reference</action>
        <action>  - 🔊 OUTPUT: "📖 Loaded rule details for {{rule_keyword}}"</action>
        <action>END FOR EACH rule_keyword</action>

        <action>📝 STEP 1D: CREATE SUBTASK IMPLEMENTATION PLAN WITH MCP GUIDANCE</action>
        <action>Synthesize all MCP guidance into a concrete implementation plan for THIS subtask</action>
        <action>🔊 OUTPUT TO USER:
"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 MCP GUIDANCE FOR SUBTASK {{subtask_number}}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Task Type: {{subtask_type}}
Context: {{subtask_additional_context}}
Rules Applied: {{rule_keywords_list}}

Key Implementation Patterns:
{{summarized_patterns}}

Security Requirements:
{{security_requirements}}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        </action>
        <action>Add to Dev Agent Record → Debug Log: "🔒 MCP PRE-IMPLEMENTATION - Subtask {{subtask_number}}: {{subtask_type}}/{{context}} | Rules: {{rule_keywords}}"</action>

        <note>If MCP server fails: ADD to {{mcp_failures}} list: "Subtask {{subtask_number}}: MCP unavailable during get_coding_patterns". OUTPUT: "⚠️ MCP unavailable - proceeding with context file standards only". Continue but flag for Step 6.</note>
      </check>

      <check if="{{use_mcp_coding_guidelines}} == true AND {{subtask_category}} == 'ADMINISTRATIVE'">
        <action>🔊 OUTPUT TO USER: "⏭️ Subtask {{subtask_number}} is ADMINISTRATIVE - skipping MCP (no security-relevant code)"</action>
        <action>Add to Dev Agent Record → Debug Log: "⏭️ Subtask {{subtask_number}} SKIPPED MCP consultation - Administrative task (no code implementation)"</action>
        <note>Administrative tasks like documentation updates, directory creation, and dependency installation do not require coding best practices consultation</note>
      </check>

      <check if="{{use_mcp_coding_guidelines}} == true AND {{subtask_category}} == 'TESTING'">
        <action>🔊 OUTPUT TO USER: "🧪 Subtask {{subtask_number}} is TESTING - using test-specific guidance"</action>
        <action>Add to Dev Agent Record → Debug Log: "🧪 Subtask {{subtask_number}} - Testing task (using test generation guidance)"</action>
        <note>Testing tasks may benefit from test generation guidance via get_test_generation_guide MCP tool</note>
      </check>
      <!-- ============ MCP CODING GUIDELINES INTEGRATION - SUBTASK LEVEL - END ============ -->

      <!-- ═══════════════════════════════════════════════════════════════════════════════ -->
      <!-- 🔨 PHASE 2: SUBTASK IMPLEMENTATION (USING MCP GUIDANCE) 🔨                      -->
      <!-- ═══════════════════════════════════════════════════════════════════════════════ -->
      <action>🔊 OUTPUT TO USER: "🔨 Implementing subtask {{subtask_number}} with MCP-guided patterns..."</action>
      <action>Implement the current subtask COMPLETELY, applying in order of priority:
        1. 🔒 MCP get_coding_patterns guidance (HIGHEST PRIORITY - security patterns)
        2. 📖 MCP get_full_rule_details specifications (REQUIRED - detailed rules)
        3. ✅ ATDD checklist guidance (if available)
        4. 📄 Story context file standards
        5. 🏗️ Agent instructions and framework conventions
      </action>
      <action>Handle error conditions and edge cases appropriately for this subtask</action>

      <!-- ═══════════════════════════════════════════════════════════════════════════════ -->
      <!-- 🚨 PHASE 3: POST-IMPLEMENTATION MCP VALIDATION (MANDATORY - BLOCKING) 🚨        -->
      <!-- ═══════════════════════════════════════════════════════════════════════════════ -->
      <!-- ╔════════════════════════════════════════════════════════════════════════════════════╗ -->
      <!-- ║  🛑 AFTER WRITING CODE, YOU MUST VALIDATE IT BEFORE MARKING SUBTASK COMPLETE 🛑     ║ -->
      <!-- ║                                                                                      ║ -->
      <!-- ║  This step catches security vulnerabilities BEFORE they enter the codebase.         ║ -->
      <!-- ║  Skipping this step = introducing SQL injection, XSS, CSRF vulnerabilities.         ║ -->
      <!-- ╚════════════════════════════════════════════════════════════════════════════════════╝ -->

      <check if="{{use_mcp_coding_guidelines}} == true AND {{subtask_category}} == 'CODE_IMPLEMENTATION'">
        <critical>🛑 STOP! CODE IS WRITTEN BUT NOT YET VALIDATED. MUST VALIDATE BEFORE MARKING COMPLETE.</critical>

        <action>📝 STEP 3A: PREPARE CODE FOR VALIDATION</action>
        <action>Extract the key code implemented for THIS subtask (functions, components, handlers, queries)</action>
        <action>Format code as a string for the validate_code tool</action>

        <action>📝 STEP 3B: CALL validate_code MCP TOOL NOW</action>
        <mandate>🚨 MANDATORY MCP CALL: Use mcp__coding-rules__validate_code with code='{{implemented_subtask_code}}' and task_type='{{subtask_type}}'</mandate>
        <action>🔊 OUTPUT TO USER: "🔍 Validating subtask {{subtask_number}} code against security standards..."</action>
        <action>WAIT for MCP validation response</action>

        <action>📝 STEP 3C: PROCESS VALIDATION RESULTS</action>
        <action>Parse validation response for:
          - HIGH severity issues (BLOCKING - must fix)
          - MEDIUM severity issues (should fix)
          - LOW severity issues (document as tech debt)
          - Security vulnerabilities detected
          - Anti-patterns identified
        </action>

        <check if="validation finds HIGH severity issues">
          <critical>🚨 BLOCKING: HIGH SEVERITY SECURITY ISSUES DETECTED - MUST FIX BEFORE CONTINUING</critical>
          <action>🔊 OUTPUT TO USER:
"🚨 SECURITY VALIDATION FAILED - Subtask {{subtask_number}}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HIGH SEVERITY ISSUES FOUND:
{{high_severity_issues_list}}

REQUIRED: Fixing these issues before proceeding...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
          </action>
          <action>Log issues in Dev Agent Record → Debug Log with severity, description, and subtask context</action>
          <action>Refactor code to address ALL HIGH severity issues in this subtask</action>
          <action>🔊 OUTPUT TO USER: "🔄 Re-validating after security fixes..."</action>
          <action>Re-validate with MCP validate_code tool</action>
          <action>REPEAT until NO HIGH severity issues remain</action>
        </check>

        <check if="validation finds MEDIUM severity issues">
          <action>🔊 OUTPUT TO USER: "⚠️ Medium severity issues found - addressing..."</action>
          <action>Log issues in Dev Agent Record → Debug Log with subtask context</action>
          <action>Address MEDIUM severity issues if feasible</action>
          <action>If not feasible, document as technical debt in Dev Notes with justification</action>
        </check>

        <check if="validation passes with no HIGH issues">
          <action>🔊 OUTPUT TO USER:
"✅ SECURITY VALIDATION PASSED - Subtask {{subtask_number}}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Code validated against: {{rules_validated}}
Security checks: PASSED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
          </action>
        </check>

        <action>Add to Dev Agent Record → Debug Log: "✅ MCP POST-VALIDATION - Subtask {{subtask_number}}: PASSED"</action>
        <note>If validation fails due to MCP unavailability: ADD to {{mcp_failures}} list: "Subtask {{subtask_number}}: MCP unavailable during validate_code". OUTPUT: "⚠️ MCP validation unavailable - flagging for Step 6 review". Continue but MUST be caught in Step 6.</note>
      </check>
      <!-- ============ MCP CODE VALIDATION - SUBTASK LEVEL - END ============ -->

      <!-- ============ PROGRESSIVE CHECKBOX MARKING - START ============ -->
      <critical>Mark checkbox IMMEDIATELY for real-time progress visibility</critical>
      <action>🔊 OUTPUT TO USER: "☑️ Marking subtask {{subtask_number}} complete"</action>
      <action>Mark current SUBTASK checkbox [x] in the story file NOW (do NOT defer to Step 5)</action>
      <action>Save the story file immediately to persist the checkbox update</action>
      <action>Add brief completion note to Dev Agent Record → Debug Log: "✅ Subtask {{subtask_number}} complete: {{subtask_description}}"</action>
      <note>Progressive checkbox marking ensures visibility into implementation progress in real-time</note>
      <!-- ============ PROGRESSIVE CHECKBOX MARKING - END ============ -->

      <action>Move to next subtask in the list</action>

    <action>END FOR EACH subtask loop</action>
    <!-- ============ SUBTASK IMPLEMENTATION LOOP - END ============ -->

    <!-- ═══════════════════════════════════════════════════════════════════════════════ -->
    <!-- 📊 TASK COMPLETION: MCP COMPLIANCE SUMMARY (MANDATORY OUTPUT) 📊                 -->
    <!-- ═══════════════════════════════════════════════════════════════════════════════ -->
    <check if="{{use_mcp_coding_guidelines}} == true">
      <action>Count total subtasks processed in this task</action>
      <action>Count subtasks with successful MCP get_coding_patterns calls</action>
      <action>Count subtasks with successful MCP validate_code calls</action>
      <action>Count subtasks skipped (ADMINISTRATIVE/TESTING)</action>
      <action>🔊 MANDATORY OUTPUT TO USER:
"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 MCP COMPLIANCE SUMMARY - Task Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Subtasks: {{subtask_count}}
├─ CODE_IMPLEMENTATION: {{code_subtask_count}}
│   ├─ MCP get_coding_patterns called: {{patterns_called_count}}/{{code_subtask_count}}
│   ├─ MCP get_full_rule_details called: {{rules_called_count}} rules
│   └─ MCP validate_code called: {{validation_called_count}}/{{code_subtask_count}}
├─ ADMINISTRATIVE (skipped MCP): {{admin_subtask_count}}
└─ TESTING: {{test_subtask_count}}

Security Validation: {{validation_status}}
MCP Failures: {{mcp_failure_count}} (see Debug Log if > 0)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      </action>
    </check>

    <!-- Final Task-Level Validation -->
    <action>After ALL subtasks are implemented, review complete task implementation for integration issues</action>
    <action>Verify all subtasks work together cohesively</action>
    <action>Add to Dev Agent Record → Completion Notes: "✅ Task complete - {{subtask_count}} subtasks implemented with MCP guidance"</action>

    <action if="new or different than what is documented dependencies are needed">ASK user for approval before adding</action>
    <action if="3 consecutive implementation failures occur">HALT and request guidance</action>
    <action if="required configuration is missing">HALT: "Cannot proceed without necessary configuration files"</action>
    <critical>Do not stop after partial progress; continue iterating subtasks until all are complete and tested or a HALT condition triggers</critical>
    <critical>Do NOT propose to pause for review, stand-ups, or validation until Step 6 gates are satisfied</critical>
  </step>

  <step n="3" goal="Author comprehensive tests">
    <action>Create unit tests for business logic and core functionality introduced/changed by the task</action>
    <action>Add integration tests for component interactions where desired by test plan or story notes</action>
    <action>Include end-to-end tests for critical user flows where desired by test plan or story notes</action>
    <action>Cover edge cases and error handling scenarios noted in the test plan or story notes</action>
  </step>

  <step n="4" goal="Run validations and tests">
    <critical>ALL validation gates in this step are BLOCKING - story cannot proceed if any validation fails</critical>

    <action>Determine how to run tests for this repo (infer or use {{run_tests_command}} if provided)</action>

    <!-- ============ VALIDATION GATE 1: ATDD TEST EXISTENCE - START ============ -->
    <check if="ATDD checklist was loaded in Step 1">
      <critical>BLOCKING GATE: ATDD checklist tests MUST exist before proceeding</critical>

      <action>Extract test file path from ATDD checklist (e.g., tests/api/database-setup.api.spec.ts)</action>
      <action>Verify test file exists at the specified path</action>

      <check if="test file does NOT exist">
        <output>🚨 BLOCKING VALIDATION FAILURE: ATDD Test File Missing

**Issue:** ATDD checklist was loaded but required test file does not exist

**ATDD Checklist:** {{atdd_checklist_file}}
**Expected Test File:** {{test_file_path}}
**Status:** FILE NOT FOUND

**Required Action:**
1. Review ATDD checklist section "Failing Tests Created (RED Phase)"
2. Create the test file with all required tests
3. Ensure tests are in RED (failing) state before implementation
4. Re-run this workflow step

**Why This Blocks:** Cannot validate implementation without tests. ATDD requires tests to exist BEFORE implementation (RED phase), then pass AFTER implementation (GREEN phase).

**HALT REASON:** Test existence validation failed - cannot proceed to Step 5
        </output>
        <action>HALT workflow execution - user must create tests from ATDD checklist before continuing</action>
      </check>

      <output>✅ ATDD test file exists: {{test_file_path}}</output>
    </check>
    <!-- ============ VALIDATION GATE 1: ATDD TEST EXISTENCE - END ============ -->

    <!-- ============ VALIDATION GATE 2: REGRESSION TESTS - START ============ -->
    <critical>BLOCKING GATE: All existing tests MUST pass (no regressions)</critical>

    <action>Run all existing tests to ensure no regressions</action>
    <action>Capture test results (pass count, fail count, error messages)</action>

    <check if="regression tests fail">
      <output>🚨 BLOCKING VALIDATION FAILURE: Regression Tests Failed

**Issue:** Changes broke existing tests

**Failed Tests:** {{failed_test_count}} / {{total_test_count}}
**Error Summary:** {{regression_errors}}

**Required Action:**
1. Review failed test output
2. Identify which changes caused regression
3. Fix implementation to restore passing tests
4. Re-run tests until all pass

**HALT REASON:** Regression detected - cannot proceed until existing functionality is preserved
      </output>
      <action>HALT workflow execution - user must fix regressions before continuing</action>
    </check>

    <output>✅ All existing tests pass - no regressions detected</output>
    <!-- ============ VALIDATION GATE 2: REGRESSION TESTS - END ============ -->

    <!-- ============ VALIDATION GATE 3: NEW TESTS - START ============ -->
    <critical>BLOCKING GATE: All new tests MUST pass</critical>

    <action>Run the new tests to verify implementation correctness</action>
    <action>Capture test results (pass count, fail count, error messages)</action>

    <check if="new tests fail">
      <output>🚨 BLOCKING VALIDATION FAILURE: New Tests Failed

**Issue:** Implementation does not satisfy test requirements

**Failed Tests:** {{failed_new_test_count}} / {{total_new_test_count}}
**Error Summary:** {{new_test_errors}}

**Required Action:**
1. Review failed test output
2. Fix implementation to satisfy test requirements
3. Re-run tests until all pass

**HALT REASON:** Implementation validation failed - tests must pass before marking task complete
      </output>
      <action>HALT workflow execution - user must fix implementation until tests pass</action>
    </check>

    <output>✅ All new tests pass - implementation validated</output>
    <!-- ============ VALIDATION GATE 3: NEW TESTS - END ============ -->

    <!-- ============ VALIDATION GATE 4: ATDD CHECKLIST TESTS - START ============ -->
    <check if="ATDD checklist was loaded in Step 1">
      <critical>BLOCKING GATE: ATDD checklist tests MUST transition from RED to GREEN</critical>

      <action>Run tests from ATDD checklist to verify RED → GREEN transition</action>
      <action>Execute test commands from checklist (e.g., `npm run test:api -- database-setup.api.spec.ts`)</action>
      <action>Parse test results for pass/fail status</action>
      <action>Count total tests in ATDD checklist vs tests that now pass</action>

      <check if="ATDD checklist tests fail">
        <output>🚨 BLOCKING VALIDATION FAILURE: ATDD Checklist Tests Failed

**Issue:** Tests from ATDD checklist are not passing (RED → GREEN transition incomplete)

**ATDD Checklist:** {{atdd_checklist_file}}
**Test File:** {{test_file_path}}
**Tests Passing:** {{passing_atdd_tests}} / {{total_atdd_tests}}
**Failed Tests:** {{failed_atdd_test_names}}

**Required Action:**
1. Review ATDD checklist "Implementation Checklist" section
2. Review failed test output to understand what's missing
3. Complete implementation tasks from checklist for failed tests
4. Re-run tests until all ATDD tests pass (GREEN phase achieved)

**HALT REASON:** ATDD validation failed - must achieve GREEN phase before proceeding
        </output>
        <action>HALT workflow execution - user must complete ATDD checklist tasks until all tests pass</action>
      </check>

      <output>✅ All ATDD checklist tests pass - RED → GREEN transition complete</output>
      <note>ATDD checklist tests successfully transitioned from RED (failing) to GREEN (passing) - test-driven development validated.</note>
    </check>
    <!-- ============ VALIDATION GATE 4: ATDD CHECKLIST TESTS - END ============ -->

    <!-- ============ VALIDATION GATE 5: CODE QUALITY - START ============ -->
    <action>Run linting and code quality checks if configured</action>

    <check if="linting fails">
      <output>⚠️ Code Quality Issues Detected

**Issue:** Linting/code quality checks failed

**Required Action:**
1. Review linting errors
2. Fix code quality issues
3. Re-run linting until all checks pass

**Note:** This is a soft warning - fix before marking story complete
      </output>
    </check>
    <!-- ============ VALIDATION GATE 5: CODE QUALITY - END ============ -->

    <!-- ============ VALIDATION GATE 6: ACCEPTANCE CRITERIA - START ============ -->
    <critical>BLOCKING GATE: ALL Acceptance Criteria MUST be validated</critical>

    <action>Validate implementation meets ALL story acceptance criteria</action>
    <action>For each AC, verify it has been implemented and tested</action>
    <action>If ACs include quantitative thresholds (e.g., test pass rate), ensure they are met</action>
    <action>If ACs include connection requirements (e.g., "database connection is established"), verify connections actually work</action>

    <check if="any AC is not satisfied">
      <output>🚨 BLOCKING VALIDATION FAILURE: Acceptance Criteria Not Met

**Issue:** One or more acceptance criteria are not satisfied

**Unsatisfied ACs:** {{unsatisfied_ac_list}}

**Required Action:**
1. Review each unsatisfied AC
2. Identify what implementation is missing
3. Complete implementation for unsatisfied ACs
4. Add tests to validate each AC
5. Re-run validation until all ACs are satisfied

**HALT REASON:** Acceptance criteria validation failed - story cannot be marked complete
      </output>
      <action>HALT workflow execution - user must satisfy all ACs before continuing</action>
    </check>

    <output>✅ All acceptance criteria validated and satisfied</output>
    <!-- ============ VALIDATION GATE 6: ACCEPTANCE CRITERIA - END ============ -->

    <output>🎯 ALL VALIDATION GATES PASSED - Task ready for completion (Step 5)</output>
  </step>

  <step n="5" goal="Finalize task completion and update story">
    <note>Subtask checkboxes were already marked progressively in Step 2. This step finalizes the parent task and prepares for the next task.</note>
    <critical>If task is a review follow-up, must mark BOTH the task checkbox AND the corresponding action item in the review section</critical>

    <action>Check if completed task has [AI-Review] prefix (indicates review follow-up task)</action>

    <check if="task is review follow-up">
      <action>Extract review item details (severity, description, related AC/file)</action>
      <action>Add to resolution tracking list: {{resolved_review_items}}</action>

      <!-- Mark task in Review Follow-ups section -->
      <action>Mark task checkbox [x] in "Tasks/Subtasks → Review Follow-ups (AI)" section</action>

      <!-- CRITICAL: Also mark corresponding action item in review section -->
      <action>Find matching action item in "Senior Developer Review (AI) → Action Items" section by matching description</action>
      <action>Mark that action item checkbox [x] as resolved</action>

      <action>Add to Dev Agent Record → Completion Notes: "✅ Resolved review finding [{{severity}}]: {{description}}"</action>
    </check>

    <action>Verify parent task checkbox is marked [x] (all subtasks already marked in Step 2)</action>
    <action>If parent task not yet marked: Mark the parent task checkbox [x] NOW</action>
    <action>Update File List section with any new, modified, or deleted files (paths relative to repo root)</action>
    <action>Add completion notes to Dev Agent Record if significant changes were made (summarize intent, approach, and any follow-ups)</action>

    <check if="review_continuation == true and {{resolved_review_items}} is not empty">
      <action>Count total resolved review items in this session</action>
      <action>Add Change Log entry: "Addressed code review findings - {{resolved_count}} items resolved (Date: {{date}})"</action>
    </check>

    <action>Save the story file</action>
    <action>Determine if more incomplete tasks remain</action>
    <action if="more tasks remain"><goto step="2">Next task</goto></action>
    <action if="no tasks remain"><goto step="6">Completion</goto></action>
  </step>

  <step n="6" goal="Story completion and mark for review" tag="sprint-status">
    <critical>STORY COMPLETION INTEGRITY AUDIT - ALL GATES ARE BLOCKING</critical>

    <!-- ============ COMPLETION GATE 1: ALL TASKS COMPLETE - START ============ -->
    <critical>BLOCKING GATE: All tasks and subtasks MUST be marked [x]</critical>

    <action>Verify ALL tasks and subtasks are marked [x] (re-scan the story document now)</action>
    <action>Count total tasks vs completed tasks</action>
    <action>List any incomplete tasks</action>

    <check if="any task is incomplete">
      <output>🚨 BLOCKING VALIDATION FAILURE: Incomplete Tasks Detected

**Issue:** Story cannot be marked complete with incomplete tasks

**Tasks Status:** {{completed_tasks}} / {{total_tasks}} complete
**Incomplete Tasks:** {{incomplete_task_list}}

**Required Action:**
1. Review incomplete tasks
2. Complete all remaining tasks following Steps 2-4
3. Ensure all subtasks are marked [x]
4. Re-run this step when all tasks complete

**HALT REASON:** Task completion validation failed - story not ready for review
      </output>
      <action>HALT workflow execution - return to Step 1 to complete remaining work</action>
    </check>

    <output>✅ All tasks and subtasks marked complete</output>
    <!-- ============ COMPLETION GATE 1: ALL TASKS COMPLETE - END ============ -->

    <!-- ============ COMPLETION GATE 2: FULL REGRESSION SUITE - START ============ -->
    <critical>BLOCKING GATE: Full regression suite MUST pass before story completion</critical>

    <action>Run the full regression suite (do not skip)</action>
    <action>Capture final test results (all tests, not just new ones)</action>

    <check if="regression failures exist">
      <output>🚨 BLOCKING VALIDATION FAILURE: Regression Suite Failed

**Issue:** Final regression suite has failing tests

**Failed Tests:** {{final_failed_test_count}} / {{final_total_test_count}}
**Error Summary:** {{final_test_errors}}

**Required Action:**
1. Review regression failures
2. Fix issues causing test failures
3. Re-run full test suite until 100% pass rate
4. Re-run this step

**HALT REASON:** Final regression validation failed - story not ready for review
      </output>
      <action>HALT workflow execution - resolve all test failures before completing</action>
    </check>

    <output>✅ Full regression suite passes - 100% test pass rate achieved</output>
    <!-- ============ COMPLETION GATE 2: FULL REGRESSION SUITE - END ============ -->

    <!-- ============ COMPLETION GATE 3: FILE LIST COMPLETE - START ============ -->
    <critical>BLOCKING GATE: File List MUST include all changed files</critical>

    <action>Confirm File List includes every changed file</action>
    <action>Use git to identify all modified/new/deleted files in the repo</action>
    <action>Compare git changes with File List section in story file</action>

    <check if="File List is incomplete">
      <output>🚨 BLOCKING VALIDATION FAILURE: File List Incomplete

**Issue:** File List does not include all changed files

**Files in File List:** {{file_list_count}}
**Files Changed (git):** {{git_changed_count}}
**Missing from File List:** {{missing_files_list}}

**Required Action:**
1. Review git status/diff output
2. Add all missing files to File List section
3. Use relative paths from repo root
4. Re-run this step

**HALT REASON:** File List validation failed - story documentation incomplete
      </output>
      <action>HALT workflow execution - update File List before completing</action>
    </check>

    <output>✅ File List complete - all changed files documented</output>
    <!-- ============ COMPLETION GATE 3: FILE LIST COMPLETE - END ============ -->

    <!-- ============ COMPLETION GATE 4: COMPLETION NOTES INTEGRITY AUDIT - START ============ -->
    <critical>BLOCKING GATE: Completion notes MUST NOT contain "next steps" or incomplete work indicators</critical>

    <action>Read Dev Agent Record → Completion Notes section</action>
    <action>Scan for suspicious phrases indicating incomplete work</action>
    <action>Check for phrases like: "Next Steps", "TODO", "when available", "requires running", "ready to", "pending", "once database is", "after setting up"</action>

    <check if="completion notes contain incomplete work indicators">
      <output>🚨 BLOCKING VALIDATION FAILURE: Completion Notes Indicate Incomplete Work

**Issue:** Completion notes suggest work is not actually complete

**Suspicious Phrases Found:** {{suspicious_phrases_list}}

**Examples:**
{{completion_notes_excerpt}}

**Why This Blocks:** Stories should only be marked complete when ALL work is done.
Phrases like "Next Steps" or "when available" indicate work is deferred, not completed.

**Required Action:**
1. Review completion notes
2. Complete any deferred work mentioned in "next steps"
3. Remove "next steps" from completion notes (move to future story if needed)
4. Update completion notes to reflect ACTUAL completion
5. Re-run this step

**HALT REASON:** Completion integrity audit failed - story marked complete with incomplete work
      </output>
      <action>HALT workflow execution - complete all work before marking story done</action>
    </check>

    <output>✅ Completion notes integrity validated - no incomplete work indicators found</output>
    <!-- ============ COMPLETION GATE 4: COMPLETION NOTES INTEGRITY AUDIT - END ============ -->

    <!-- ============ COMPLETION GATE 5: DEFINITION OF DONE - START ============ -->
    <action>Execute story definition-of-done checklist, if the story includes one</action>

    <check if="definition-of-done exists and is not satisfied">
      <output>🚨 BLOCKING VALIDATION FAILURE: Definition of Done Not Satisfied

**Issue:** Story includes DoD checklist but not all items are complete

**DoD Items:** {{dod_total}}
**Completed:** {{dod_completed}}
**Incomplete:** {{dod_incomplete_list}}

**Required Action:**
1. Review DoD checklist in story file
2. Complete all incomplete DoD items
3. Re-run this step

**HALT REASON:** Definition of Done not satisfied
      </output>
      <action>HALT workflow execution - satisfy DoD before completing</action>
    </check>

    <output>✅ Definition of Done satisfied (or no DoD checklist present)</output>
    <!-- ============ COMPLETION GATE 5: DEFINITION OF DONE - END ============ -->

    <!-- ============ COMPLETION GATE 6: MCP VALIDATION INTEGRITY - START ============ -->
    <check if="{{use_mcp_coding_guidelines}} == true">
      <critical>BLOCKING GATE: If MCP was required, ALL MCP validations must have succeeded</critical>

      <action>Review {{mcp_failures}} list for any MCP failures during story implementation</action>
      <action>Count total MCP failures recorded</action>

      <check if="{{mcp_failures}} is not empty">
        <output>🚨 BLOCKING VALIDATION FAILURE: MCP Validation Incomplete

**Issue:** MCP coding-rules was required but failed for some subtasks due to runtime errors

**MCP Failures Detected:** {{mcp_failure_count}}
**Affected Subtasks:**
{{mcp_failures_list}}

**Why This Blocks:**
The story was implemented with use_mcp_coding_guidelines=true (enterprise standards required).
However, MCP server became unavailable during implementation, meaning some code lacks:
  - Security vulnerability validation (SQL injection, XSS, CSRF)
  - Enterprise coding pattern enforcement
  - Best practice compliance checks

**Root Cause:** MCP server crashed or became unreachable during story execution (passed Step 0 but failed mid-implementation)

**Required Actions:**
1. Fix MCP server stability issue
2. Review and re-implement affected subtasks listed above
3. For each affected subtask:
   - Manually review code for security vulnerabilities
   - Apply MCP coding patterns from nuvana_control/nuvana_mcp/coding_rules/rules/
   - OR re-run subtask implementation with MCP available
4. Clear {{mcp_failures}} list
5. Re-run Step 6

**Alternative (NOT RECOMMENDED):**
Manually review ALL affected subtasks for security issues and document in Dev Agent Record that MCP validation was performed manually. Then clear {{mcp_failures}} list.

**HALT REASON:** Story requires MCP validation but MCP failed for {{mcp_failure_count}} subtasks
        </output>
        <action>HALT workflow execution - affected subtasks must be re-validated with MCP before story completion</action>
      </check>

      <output>✅ MCP validation integrity verified - all subtasks validated with MCP successfully</output>
    </check>
    <!-- ============ COMPLETION GATE 6: MCP VALIDATION INTEGRITY - END ============ -->

    <output>🎯 ALL COMPLETION GATES PASSED - Story ready for review status</output>

    <action>Update the story Status to: review</action>


    <!-- CRITICAL: Mark story ready for CI/CD pipeline (Workflow 11) -->
    <critical>This step is MANDATORY for CI/CD pipeline to identify which story to process next</critical>
    <action>Add "Workflow-11: ready" to the story file header (immediately after the Status line)</action>
    <action>If "Workflow-11:" line already exists in header, update its value to "ready"</action>
    <action>The header format should be:
# Story {{story_key}}: {{story_title}}

Status: review
Workflow-11: ready
    </action>
    <note>Workflow 11 (CI Pipeline) scans all story files looking for "Workflow-11: ready" to determine which story to process. Without this marker, Workflow 11 will skip this story.</note>
    <!-- Mark story ready for review -->
    <action>Load the FULL file: {{output_sprint_status_folder}}/sprint-status.yaml</action>
    <action>Find development_status key matching {{story_key}}</action>
    <action>Verify current status is "in-progress" (expected previous state)</action>
    <action>Update development_status[{{story_key}}] = "review"</action>
    <action>Save file, preserving ALL comments and structure including STATUS DEFINITIONS</action>

    <check if="story key not found in file">
      <output>⚠️ Story file updated, but sprint-status update failed: {{story_key}} not found

Story is marked Ready for Review in file, but sprint-status.yaml may be out of sync.
      </output>
    </check>

    <action if="any task is incomplete">Return to step 1 to complete remaining work (Do NOT finish with partial progress)</action>
    <action if="regression failures exist">STOP and resolve before completing</action>
    <action if="File List is incomplete">Update it before completing</action>
  </step>

  <step n="7" goal="Completion communication and user support">
    <action>Optionally run the workflow validation task against the story using {project-root}/nuvana_control/core/tasks/validate-workflow.xml (if available)</action>
    <action>Prepare a concise summary in Dev Agent Record → Completion Notes</action>

    <action>Communicate to {user_name} that story implementation is complete and ready for review</action>
    <action>Summarize key accomplishments: story ID, story key, title, key changes made, tests added, files modified</action>
    <action>Provide the story file path and current status (now "review", was "in-progress")</action>

    <action>Based on {user_skill_level}, ask if user needs any explanations about:
      - What was implemented and how it works
      - Why certain technical decisions were made
      - How to test or verify the changes
      - Any patterns, libraries, or approaches used
      - Anything else they'd like clarified
    </action>

    <check if="user asks for explanations">
      <action>Provide clear, contextual explanations tailored to {user_skill_level}</action>
      <action>Use examples and references to specific code when helpful</action>
    </check>

    <action>Once explanations are complete (or user indicates no questions), suggest logical next steps</action>
    <action>Common next steps to suggest (but allow user flexibility):
      - Review the implemented story yourself and test the changes
      - Verify all acceptance criteria are met
      - Ensure deployment readiness if applicable
      - Check sprint-status.yaml to see project progress
      - Continue with next ready story
    </action>
    <action>Remain flexible - allow user to choose their own path or ask for other assistance</action>
  </step>

</workflow>
```
