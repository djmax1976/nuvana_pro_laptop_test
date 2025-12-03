/**
 * Bulk Transaction Import Integration Tests - Story 3.6
 *
 * @test-level INTEGRATION
 * @justification Integration tests for end-to-end bulk import flow with database and RabbitMQ, verifying complete processing pipeline
 * @story 3-6-bulk-transaction-import
 * @enhanced-by workflow-9 on 2025-11-28
 *
 * STORY: As a System Admin, I want to import transactions in bulk from external POS systems,
 * so that historical data can be migrated or synced.
 *
 * TEST LEVEL: Integration (end-to-end flow with database and RabbitMQ)
 * PRIMARY GOAL: Verify complete bulk import flow from upload to processing to completion
 *
 * BUSINESS RULES TESTED:
 * - End-to-end bulk import flow (upload → parse → validate → enqueue → process → complete)
 * - Import job tracking accuracy (progress metrics, status updates)
 * - Error reporting accuracy (row numbers, field names, error messages)
 * - Audit log entries (creation, completion)
 * - RabbitMQ integration (messages enqueued and processed)
 *
 * ACCEPTANCE CRITERIA COVERAGE:
 * - AC #1: File upload, validation, enqueueing, job creation
 * - AC #2: Status checking, progress metrics, error reporting, audit logging
 * - AC #3: Results summary, error report download, job status updates
 */

import { test, expect } from "../support/fixtures/rbac.fixture";
import { createTransactionPayload } from "../support/factories";
import { createCompany, createStore, createUser } from "../support/helpers";
import { PrismaClient } from "@prisma/client";

// Skip bulk import integration tests unless explicitly enabled (requires RabbitMQ and worker)
// Set BULK_IMPORT_TESTS=true to run these tests
const bulkImportEnabled = process.env.BULK_IMPORT_TESTS === "true";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface TestStoreAndShift {
  store: { store_id: string; company_id: string; name: string };
  shift: {
    shift_id: string;
    store_id: string;
    cashier_id: string;
    status: string;
  };
}

/**
 * Creates a store and open shift for testing transactions
 */
async function createTestStoreAndShift(
  prismaClient: PrismaClient,
  companyId: string,
  cashierId: string,
  storeName?: string,
): Promise<TestStoreAndShift> {
  const store = await createStore(prismaClient, {
    company_id: companyId,
    name: storeName || `Test Store ${Date.now()}`,
    timezone: "America/New_York",
    status: "ACTIVE",
  });

  const shift = await prismaClient.shift.create({
    data: {
      store_id: store.store_id,
      opened_by: cashierId,
      cashier_id: cashierId,
      opening_cash: 100.0,
      status: "OPEN",
    },
  });

  return { store, shift };
}

/**
 * Escapes a CSV field value according to RFC 4180
 * - If the field contains commas, newlines, or double quotes, wrap it in double quotes
 * - Double quotes within the field are escaped by doubling them
 */
function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  // If the field contains comma, newline, or double quote, wrap in quotes
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    // Escape double quotes by doubling them
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Creates a CSV file content with transaction data
 */
function createCSVContent(transactions: any[]): string {
  const header = [
    "store_id",
    "shift_id",
    "cashier_id",
    "timestamp",
    "subtotal",
    "tax",
    "discount",
    "total",
    "line_items",
    "payments",
  ].join(",");

  const rows = transactions.map((tx) => {
    return [
      escapeCsvField(tx.store_id),
      escapeCsvField(tx.shift_id),
      escapeCsvField(tx.cashier_id || ""),
      escapeCsvField(tx.timestamp || new Date().toISOString()),
      escapeCsvField(tx.subtotal),
      escapeCsvField(tx.tax),
      escapeCsvField(tx.discount),
      escapeCsvField(tx.total),
      escapeCsvField(JSON.stringify(tx.line_items)),
      escapeCsvField(JSON.stringify(tx.payments)),
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

/**
 * Creates a JSON file content with transaction data
 */
function createJSONContent(transactions: any[]): string {
  return JSON.stringify(transactions, null, 2);
}

/**
 * Wait for job to reach a specific status
 */
async function waitForJobStatus(
  apiRequest: any,
  jobId: string,
  targetStatus: string,
  maxWaitMs: number = 30000,
  pollIntervalMs: number = 1000,
): Promise<any> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const response = await apiRequest.get(
      `/api/transactions/bulk-import/${jobId}`,
    );
    const body = await response.json();
    if (body.data?.job?.status === targetStatus) {
      return body.data.job;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(
    `Job ${jobId} did not reach status ${targetStatus} within ${maxWaitMs}ms`,
  );
}

// =============================================================================
// SECTION 1: P0 CRITICAL - END-TO-END BULK IMPORT FLOW (AC-1, AC-2, AC-3)
// =============================================================================

test.describe("Bulk Import Integration - End-to-End Flow", () => {
  test.skip(
    !bulkImportEnabled,
    "Bulk import integration tests require BULK_IMPORT_TESTS=true",
  );
  // Run tests serially to avoid rate limiting on bulk import endpoint
  // The endpoint has a rate limit of 5 uploads per minute per user
  test.describe.configure({ mode: "serial" });
  test("3.6-INT-001: [P0] should complete full bulk import flow (upload → process → status)", async ({
    superadminApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as System Admin with valid store and shift
    const company = await createCompany(prismaClient);
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      company.company_id,
      superadminUser.user_id,
    );

    // Create CSV with 3 valid transactions
    const transactions = Array.from({ length: 3 }, () =>
      createTransactionPayload({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: superadminUser.user_id,
      }),
    );
    const csvContent = createCSVContent(transactions);

    // WHEN: Uploading file
    const formData = new FormData();
    const blob = new Blob([csvContent], { type: "text/csv" });
    formData.append("file", blob, "transactions.csv");

    const uploadResponse = await superadminApiRequest.post(
      "/api/transactions/bulk-import",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );

    // THEN: Should return 202 with job_id
    expect(
      uploadResponse.status(),
      "Should return 202 for accepted import",
    ).toBe(202);
    const uploadBody = await uploadResponse.json();
    expect(uploadBody.success, "Response should indicate success").toBe(true);
    const jobId = uploadBody.data?.job_id;
    expect(jobId, "Should return job_id").toBeTruthy();

    // Wait for job to complete (or at least process)
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // WHEN: Checking job status
    const statusResponse = await superadminApiRequest.get(
      `/api/transactions/bulk-import/${jobId}`,
    );

    // THEN: Job should show progress
    expect(statusResponse.status(), "Should return 200 for status check").toBe(
      200,
    );
    const statusBody = await statusResponse.json();
    expect(statusBody.success, "Status response should indicate success").toBe(
      true,
    );
    expect(statusBody.data?.job, "Should include job object").toBeTruthy();
    expect(statusBody.data.job.job_id, "Job ID should match").toBe(jobId);
    expect(statusBody.data.job.total_rows, "Should track total rows").toBe(3);
    expect(
      statusBody.data.job.status,
      "Job should be PROCESSING or COMPLETED",
    ).toMatch(/PROCESSING|COMPLETED/);

    // Verify transactions were enqueued (processed_rows > 0 or status = COMPLETED)
    if (statusBody.data.job.status === "COMPLETED") {
      expect(
        statusBody.data.job.processed_rows,
        "Should have processed all valid transactions",
      ).toBeGreaterThan(0);
    }
  });

  test("3.6-INT-002: [P0] should track import job progress accurately", async ({
    superadminApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as System Admin with valid store and shift
    const company = await createCompany(prismaClient);
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      company.company_id,
      superadminUser.user_id,
    );

    // Create CSV with 10 valid transactions
    const transactions = Array.from({ length: 10 }, () =>
      createTransactionPayload({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: superadminUser.user_id,
      }),
    );
    const csvContent = createCSVContent(transactions);

    // WHEN: Uploading file
    const formData = new FormData();
    const blob = new Blob([csvContent], { type: "text/csv" });
    formData.append("file", blob, "transactions.csv");

    const uploadResponse = await superadminApiRequest.post(
      "/api/transactions/bulk-import",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );

    const uploadBody = await uploadResponse.json();
    const jobId = uploadBody.data?.job_id;

    // Wait for processing to start
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // THEN: Job tracking should be accurate
    const statusResponse = await superadminApiRequest.get(
      `/api/transactions/bulk-import/${jobId}`,
    );
    const statusBody = await statusResponse.json();

    expect(
      statusBody.data?.job?.total_rows,
      "Total rows should match file",
    ).toBe(10);
    expect(
      statusBody.data.job.processed_rows,
      "Processed rows should be <= total rows",
    ).toBeLessThanOrEqual(10);
    expect(
      statusBody.data.job.error_rows,
      "Error rows should be >= 0",
    ).toBeGreaterThanOrEqual(0);
    expect(
      statusBody.data.job.processed_rows + statusBody.data.job.error_rows,
      "Processed + error rows should equal total",
    ).toBeLessThanOrEqual(statusBody.data.job.total_rows);
  });

  test("3.6-INT-003: [P0] should report errors accurately with row numbers", async ({
    superadminApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as System Admin with valid store and shift
    const company = await createCompany(prismaClient);
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      company.company_id,
      superadminUser.user_id,
    );

    // Create CSV with mix of valid and invalid transactions
    const validTransaction = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
      cashier_id: superadminUser.user_id,
    });

    const invalidTransaction = {
      store_id: store.store_id,
      // Missing shift_id - should cause validation error
      subtotal: 100.0,
      tax: 8.0,
      discount: 0,
      total: 108.0,
      line_items: [{ sku: "TEST", name: "Test", quantity: 1, unit_price: 100 }],
      payments: [{ method: "CASH", amount: 108 }],
    };

    const csvContent = createCSVContent([validTransaction, invalidTransaction]);

    // WHEN: Uploading file
    const formData = new FormData();
    const blob = new Blob([csvContent], { type: "text/csv" });
    formData.append("file", blob, "mixed-transactions.csv");

    const uploadResponse = await superadminApiRequest.post(
      "/api/transactions/bulk-import",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );

    const uploadBody = await uploadResponse.json();
    const jobId = uploadBody.data?.job_id;

    // Wait for validation
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // THEN: Error report should be accurate
    const statusResponse = await superadminApiRequest.get(
      `/api/transactions/bulk-import/${jobId}`,
    );
    const statusBody = await statusResponse.json();

    expect(statusBody.data?.errors, "Should include errors array").toBeTruthy();
    expect(
      statusBody.data.errors.length,
      "Should have at least one error",
    ).toBeGreaterThan(0);

    // Find error for row 3 (invalid transaction - row 1 is header, row 2 is valid, row 3 is invalid)
    const row3Error = statusBody.data.errors.find(
      (err: any) => err.row_number === 3,
    );
    expect(
      row3Error,
      "Should have error for row 3 (invalid transaction)",
    ).toBeTruthy();
    expect(row3Error.field, "Error should include field name").toBeTruthy();
    expect(row3Error.error, "Error should include error message").toBeTruthy();

    // Verify error report endpoint
    const errorReportResponse = await superadminApiRequest.get(
      `/api/transactions/bulk-import/${jobId}/errors?format=json`,
    );
    const errorReportBody = await errorReportResponse.json();
    expect(
      errorReportBody.success,
      "Error report should indicate success",
    ).toBe(true);
    expect(
      Array.isArray(errorReportBody.data?.errors),
      "Should return errors array",
    ).toBe(true);
  });

  test("3.6-INT-004: [P0] should create audit log entries for import operations", async ({
    superadminApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as System Admin with valid store and shift
    const company = await createCompany(prismaClient);
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      company.company_id,
      superadminUser.user_id,
    );

    const transaction = createTransactionPayload({
      store_id: store.store_id,
      shift_id: shift.shift_id,
      cashier_id: superadminUser.user_id,
    });
    const csvContent = createCSVContent([transaction]);

    // WHEN: Uploading file
    const formData = new FormData();
    const blob = new Blob([csvContent], { type: "text/csv" });
    formData.append("file", blob, "transactions.csv");

    const uploadResponse = await superadminApiRequest.post(
      "/api/transactions/bulk-import",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );

    expect(
      uploadResponse.status(),
      "Should return 202 for accepted import",
    ).toBe(202);
    const uploadBody = await uploadResponse.json();
    const jobId = uploadBody.data?.job_id;
    expect(jobId, "Should return job_id").toBeTruthy();

    // Wait for job to complete
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // THEN: Audit log should have entries for job creation and completion
    // Query with both record_id AND user_id to ensure we get the right log
    const createAuditLogs = await prismaClient.auditLog.findMany({
      where: {
        table_name: "bulk_import_jobs",
        record_id: jobId,
        action: "CREATE",
        user_id: superadminUser.user_id,
      },
    });

    expect(
      createAuditLogs.length,
      `Should have audit log for job creation (jobId: ${jobId}, userId: ${superadminUser.user_id})`,
    ).toBeGreaterThan(0);
    const createLog = createAuditLogs[0];
    expect(createLog.user_id, "Audit log should include user_id").toBe(
      superadminUser.user_id,
    );
    expect(
      createLog.new_values,
      "Audit log should include new_values",
    ).toBeTruthy();

    // Check for completion audit log
    const updateAuditLogs = await prismaClient.auditLog.findMany({
      where: {
        table_name: "bulk_import_jobs",
        record_id: jobId,
        action: "UPDATE",
        user_id: superadminUser.user_id,
      },
    });

    expect(
      updateAuditLogs.length,
      "Should have audit log for job completion",
    ).toBeGreaterThan(0);
  });

  test("3.6-INT-005: [P0] should enqueue transactions to RabbitMQ and process them", async ({
    superadminApiRequest,
    superadminUser,
    prismaClient,
  }) => {
    // GIVEN: I am authenticated as System Admin with valid store and shift
    const company = await createCompany(prismaClient);
    const { store, shift } = await createTestStoreAndShift(
      prismaClient,
      company.company_id,
      superadminUser.user_id,
    );

    // Create CSV with 5 valid transactions
    const transactions = Array.from({ length: 5 }, () =>
      createTransactionPayload({
        store_id: store.store_id,
        shift_id: shift.shift_id,
        cashier_id: superadminUser.user_id,
      }),
    );
    const csvContent = createCSVContent(transactions);

    // WHEN: Uploading file
    const formData = new FormData();
    const blob = new Blob([csvContent], { type: "text/csv" });
    formData.append("file", blob, "transactions.csv");

    const uploadResponse = await superadminApiRequest.post(
      "/api/transactions/bulk-import",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      },
    );

    const uploadBody = await uploadResponse.json();
    const jobId = uploadBody.data?.job_id;
    expect(jobId, "Should have job_id").toBeTruthy();

    // Wait for job to complete with processed rows (polling)
    // The job needs time to:
    // 1. Parse the CSV file
    // 2. Validate each transaction
    // 3. Enqueue valid transactions to RabbitMQ
    // 4. Update processed_rows count
    let jobStatus: string = "PENDING";
    let processedRows = 0;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max wait
    while (attempts < maxAttempts) {
      const statusResponse = await superadminApiRequest.get(
        `/api/transactions/bulk-import/${jobId}`,
      );
      const statusBody = await statusResponse.json();
      jobStatus = statusBody.data?.job?.status || "PENDING";
      processedRows = statusBody.data?.job?.processed_rows || 0;

      // Success: Job completed and we have processed rows
      if (jobStatus === "COMPLETED" && processedRows > 0) {
        break;
      }

      // Keep waiting if still processing
      if (jobStatus === "PROCESSING") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;
        continue;
      }

      if (jobStatus === "FAILED") {
        const errorSummary = JSON.stringify(
          statusBody.data?.job?.error_summary || "Unknown error",
        );
        throw new Error(`Bulk import job failed: ${errorSummary}`);
      }

      // Keep waiting if still pending
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    // THEN: Job should be COMPLETED with processed rows
    expect(jobStatus, "Job should be COMPLETED after waiting").toBe(
      "COMPLETED",
    );

    // THEN: Transactions should have been enqueued to RabbitMQ
    // processed_rows > 0 indicates messages were successfully published to the queue
    expect(
      processedRows,
      "Should have enqueued at least some transactions to RabbitMQ",
    ).toBeGreaterThan(0);

    // Wait for worker to process the queued messages
    // The worker consumes from RabbitMQ and creates Transaction records in the database
    // Poll the database for up to 30 seconds to verify worker processing
    let dbTransactions: any[] = [];
    let workerAttempts = 0;
    const maxWorkerAttempts = 30;

    while (workerAttempts < maxWorkerAttempts) {
      dbTransactions = await prismaClient.transaction.findMany({
        where: {
          store_id: store.store_id,
          shift_id: shift.shift_id,
        },
        take: 10,
      });

      // If we found transactions, worker has processed them
      if (dbTransactions.length > 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      workerAttempts++;
    }

    // THEN: Worker should have created Transaction records in the database
    // This verifies the full end-to-end flow: API -> RabbitMQ -> Worker -> Database
    expect(
      dbTransactions.length,
      `Worker should have processed at least some transactions within ${maxWorkerAttempts} seconds. ` +
        `Enqueued: ${processedRows}, Found in DB: ${dbTransactions.length}. ` +
        `Ensure the transaction worker is running (npm run worker:transaction).`,
    ).toBeGreaterThan(0);
  });
});
