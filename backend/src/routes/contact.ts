import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
// import { PrismaClient } from "@prisma/client";

// TODO: Uncomment when contacts table is added to Prisma schema
// const prisma = new PrismaClient();

interface ContactRequestBody {
  name: string;
  email: string;
  message: string;
}

/**
 * Contact Form Routes
 *
 * Handles contact form submissions from the marketing homepage.
 * No authentication required (public endpoint).
 */
export async function contactRoutes(fastify: FastifyInstance) {
  // POST /api/contact - Submit contact form
  fastify.post(
    "/api/contact",
    async (
      request: FastifyRequest<{ Body: ContactRequestBody }>,
      reply: FastifyReply,
    ) => {
      try {
        const { name, email, message } = request.body;

        // Validate required fields
        if (!name || name.trim() === "") {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Name is required and cannot be empty",
            },
          };
        }

        if (!email || email.trim() === "") {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Email is required and cannot be empty",
            },
          };
        }

        // Basic email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Email format is invalid",
            },
          };
        }

        if (!message || message.trim() === "") {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Message is required and cannot be empty",
            },
          };
        }

        // Rate limiting check (simple in-memory for now)
        // TODO: Implement proper rate limiting with Redis
        // For now, just log the submission

        // Save contact form submission
        // TODO: Create contacts table in Prisma schema
        // For now, log to console and return success
        fastify.log.info(
          {
            name,
            email,
            message: message.substring(0, 50) + "...",
            ip: request.ip,
            userAgent: request.headers["user-agent"],
          },
          "Contact form submission received",
        );

        // TODO: Send email notification to admin
        // TODO: Add to database when contacts table exists

        reply.code(200);
        return {
          success: true,
          message: "Thank you! We'll be in touch soon.",
        };
      } catch (error: any) {
        fastify.log.error({ error }, "Error processing contact form");
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Something went wrong. Please try again.",
          },
        };
      }
    },
  );

  // Health check for contact API
  fastify.get("/api/contact/health", async (_request, reply) => {
    reply.code(200);
    return { status: "ok", endpoint: "contact" };
  });
}
