import { prisma } from "../src/client.js"

const DEFAULT_SKILLS = [
  {
    id: "skill-frontend-design",
    name: "Frontend Design",
    description: "Modern UI/UX patterns with responsive design and accessibility",
    instructions: "Apply modern UI/UX best practices: use semantic HTML, ensure responsive layouts with mobile-first approach, follow WCAG 2.1 AA accessibility standards, use consistent spacing and typography scales, prefer CSS Grid/Flexbox for layouts, implement proper focus management and keyboard navigation.",
    tags: ["frontend", "ui", "ux", "design", "css", "html", "tailwind", "responsive"],
    applicablePhases: ["discovery", "planning", "development", "testing"],
    category: "design",
  },
  {
    id: "skill-copywriting",
    name: "Copywriting",
    description: "User-facing text, microcopy, and content guidelines",
    instructions: "Write clear, concise user-facing copy: use active voice, avoid jargon, keep sentences short (max 20 words), write actionable button labels (e.g., 'Save changes' not 'Submit'), provide helpful error messages that explain what went wrong and how to fix it, use sentence case for headings, be consistent with terminology throughout the interface.",
    tags: ["copy", "text", "content", "microcopy", "ux writing", "copywriting"],
    applicablePhases: ["discovery", "planning", "development"],
    category: "design",
  },
  {
    id: "skill-stripe",
    name: "Stripe Integration",
    description: "Payment processing with Stripe APIs and webhooks",
    instructions: "Follow Stripe best practices: use Payment Intents API for payments, implement webhook handlers with signature verification, use idempotency keys for POST requests, handle all payment states (succeeded, failed, requires_action), store Stripe customer IDs for returning customers, use Stripe.js/Elements for PCI compliance, implement proper error handling for declined cards and network errors.",
    tags: ["stripe", "payment", "checkout", "subscription", "billing", "webhook"],
    applicablePhases: ["discovery", "planning", "development", "testing"],
    category: "integrations",
  },
  {
    id: "skill-nextjs",
    name: "Next.js",
    description: "Next.js App Router patterns and best practices",
    instructions: "Follow Next.js App Router conventions: use Server Components by default, add 'use client' only when needed (event handlers, hooks, browser APIs), co-locate loading.tsx/error.tsx/not-found.tsx, use generateMetadata for SEO, prefer server actions for mutations, use next/image for optimized images, implement proper caching with revalidatePath/revalidateTag, use route groups for layout organization.",
    tags: ["next", "nextjs", "next.js", "react", "app router", "server components"],
    applicablePhases: ["planning", "development", "testing"],
    category: "frontend",
  },
  {
    id: "skill-react-patterns",
    name: "React Patterns",
    description: "Modern React patterns and component architecture",
    instructions: "Use modern React patterns: prefer function components with hooks, use composition over inheritance, implement controlled components for forms, use custom hooks for shared logic, keep components small and focused (max ~150 lines), use React.memo only when profiling shows performance issues, implement proper error boundaries, use Suspense for data fetching, avoid prop drilling with context or state management.",
    tags: ["react", "component", "hook", "state", "jsx", "tsx"],
    applicablePhases: ["planning", "development", "testing"],
    category: "frontend",
  },
  {
    id: "skill-database-optimization",
    name: "Database Optimization",
    description: "SQL query optimization and database design patterns",
    instructions: "Optimize database operations: add indexes for frequently queried columns, use composite indexes for multi-column queries, avoid N+1 queries (use includes/joins), use database transactions for multi-step operations, implement pagination with cursor-based approach for large datasets, use connection pooling, write efficient WHERE clauses (most selective first), avoid SELECT * in production queries.",
    tags: ["database", "sql", "postgres", "prisma", "query", "index", "optimization"],
    applicablePhases: ["planning", "development", "testing"],
    category: "backend",
  },
  {
    id: "skill-api-design",
    name: "API Design",
    description: "RESTful API design and best practices",
    instructions: "Follow REST API best practices: use proper HTTP methods (GET=read, POST=create, PUT=replace, PATCH=partial update, DELETE=remove), return appropriate status codes (200, 201, 400, 401, 403, 404, 500), implement consistent error response format, use plural nouns for resources, version APIs when breaking changes are needed, validate input with schemas, implement pagination for list endpoints, use proper CORS configuration.",
    tags: ["api", "rest", "endpoint", "route", "fastify", "express"],
    applicablePhases: ["planning", "development", "testing"],
    category: "backend",
  },
  {
    id: "skill-testing-patterns",
    name: "Testing Patterns",
    description: "Unit, integration, and E2E testing strategies",
    instructions: "Write effective tests: follow AAA pattern (Arrange, Act, Assert), test behavior not implementation, use descriptive test names that explain the expected behavior, mock external dependencies but not the module under test, write integration tests for critical paths, keep tests independent and idempotent, aim for high coverage on business logic, use factories/fixtures for test data setup.",
    tags: ["test", "testing", "jest", "vitest", "e2e", "unit test", "integration"],
    applicablePhases: ["planning", "development", "testing"],
    category: "quality",
  },
  {
    id: "skill-accessibility",
    name: "Accessibility",
    description: "Web accessibility standards and ARIA patterns",
    instructions: "Ensure WCAG 2.1 AA compliance: use semantic HTML elements (nav, main, article, button), provide alt text for images, ensure sufficient color contrast (4.5:1 for text), implement keyboard navigation for all interactive elements, use ARIA labels where semantic HTML is insufficient, ensure form inputs have associated labels, provide skip links for navigation, test with screen readers, support reduced motion preferences.",
    tags: ["a11y", "accessibility", "aria", "wcag", "screen reader", "keyboard"],
    applicablePhases: ["planning", "development", "testing"],
    category: "quality",
  },
  {
    id: "skill-seo",
    name: "SEO",
    description: "Search engine optimization for web applications",
    instructions: "Implement SEO best practices: use semantic HTML structure (h1-h6 hierarchy), implement meta tags (title, description, og:tags), use canonical URLs, implement structured data (JSON-LD), ensure fast page load times, use descriptive URLs, implement proper sitemap.xml and robots.txt, use alt text for images, ensure mobile-friendliness, implement proper redirects (301 for permanent, 302 for temporary).",
    tags: ["seo", "meta", "sitemap", "structured data", "og", "search"],
    applicablePhases: ["planning", "development"],
    category: "frontend",
  },
  {
    id: "skill-authentication",
    name: "Authentication",
    description: "Authentication and authorization patterns",
    instructions: "Implement secure authentication: use established auth libraries (Better Auth, NextAuth, Clerk), never store plain-text passwords, implement proper session management with secure cookies (HttpOnly, SameSite, Secure), use CSRF protection, implement rate limiting on auth endpoints, use proper password policies, support MFA where appropriate, implement proper logout (invalidate sessions), protect against timing attacks in token comparison.",
    tags: ["auth", "authentication", "login", "session", "jwt", "oauth", "better-auth"],
    applicablePhases: ["planning", "development", "testing"],
    category: "backend",
  },
  {
    id: "skill-error-handling",
    name: "Error Handling",
    description: "Robust error handling and recovery patterns",
    instructions: "Implement comprehensive error handling: use try-catch for async operations, create custom error classes for different error types, implement error boundaries in React, provide user-friendly error messages, log errors with context (request ID, user ID, stack trace), implement graceful degradation, use circuit breakers for external service calls, handle timeout and network errors, never expose internal error details to users.",
    tags: ["error", "exception", "error handling", "try-catch", "error boundary"],
    applicablePhases: ["development", "testing"],
    category: "quality",
  },
  {
    id: "skill-performance",
    name: "Performance",
    description: "Web and server performance optimization techniques",
    instructions: "Optimize performance: implement lazy loading for images and components, use code splitting with dynamic imports, minimize bundle size (tree-shaking, avoiding large dependencies), use caching headers properly, implement memoization for expensive computations, optimize database queries with proper indexes, use CDN for static assets, implement pagination instead of loading all data, profile before optimizing.",
    tags: ["performance", "optimization", "lazy loading", "caching", "bundle", "speed"],
    applicablePhases: ["planning", "development", "testing"],
    category: "quality",
  },
  {
    id: "skill-security",
    name: "Security",
    description: "Web application security best practices (OWASP)",
    instructions: "Follow OWASP security guidelines: sanitize all user input to prevent XSS, use parameterized queries to prevent SQL injection, implement CSRF protection, validate and sanitize file uploads, use Content Security Policy headers, implement rate limiting, never expose sensitive data in logs or error messages, use HTTPS everywhere, keep dependencies updated, implement proper access control (RBAC), validate authorization on every request.",
    tags: ["security", "xss", "csrf", "owasp", "sanitize", "validation"],
    applicablePhases: ["development", "testing"],
    category: "quality",
  },
  {
    id: "skill-mobile-responsive",
    name: "Mobile & Responsive",
    description: "Mobile-first responsive design patterns",
    instructions: "Build mobile-first responsive interfaces: start with mobile styles and add breakpoints for larger screens, use relative units (rem, em, %) over fixed pixels, ensure touch targets are at least 44x44px, implement proper viewport meta tag, use CSS Grid and Flexbox for flexible layouts, test on real devices and multiple screen sizes, handle orientation changes, optimize images for different screen densities, consider thumb zones for mobile interactions.",
    tags: ["mobile", "responsive", "breakpoint", "touch", "viewport", "adaptive"],
    applicablePhases: ["planning", "development", "testing"],
    category: "design",
  },
]

async function seed() {
  console.log("Seeding database...")

  // Create default tenant: Bee The Tech
  const org = await prisma.organization.upsert({
    where: { slug: "bee-the-tech" },
    update: {},
    create: {
      id: "bee-the-tech-org",
      name: "Bee The Tech",
      slug: "bee-the-tech",
    },
  })

  // Seed default skills (global, tenantId=null)
  for (const skill of DEFAULT_SKILLS) {
    await prisma.skill.upsert({
      where: { id: skill.id },
      update: {
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        tags: skill.tags,
        applicablePhases: skill.applicablePhases,
        category: skill.category,
      },
      create: {
        id: skill.id,
        tenantId: null,
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        tags: skill.tags,
        applicablePhases: skill.applicablePhases,
        category: skill.category,
        enabled: true,
        isDefault: true,
      },
    })
  }

  console.log(`Seed complete: "${org.name}" tenant created, ${DEFAULT_SKILLS.length} default skills seeded`)
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error)
    process.exit(1)
  })
  .finally(() => process.exit())
