// Vitest globalSetup for packages/db integration tests → database `restoos_test`.
import { prepareTestDatabase } from "../src/testing";

export default () => prepareTestDatabase();
