// Vitest globalSetup for apps/api integration tests → its own database `restoos_test_api`
// (so it never blocks packages/db's tests when turbo runs them in parallel).
import { prepareTestDatabase } from "@restoos/db/testing";

export default () => prepareTestDatabase("api");
