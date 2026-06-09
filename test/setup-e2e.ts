// Per-suite setup for the e2e project. Booting a Nest app and hitting a real
// database is slower than a unit test, so give each test a generous timeout.
jest.setTimeout(30_000);
