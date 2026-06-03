import type { Config } from "jest";

const tsJest = ["ts-jest", { tsconfig: "<rootDir>/tsconfig.jest.json" }] as const;

const shared = {
  moduleNameMapper: {
    // next-intl ships ESM that Jest can't transform; map its entry points to
    // lightweight mocks (real German messages, passthrough routing/middleware).
    "^next-intl$": "<rootDir>/test-utils/next-intl-mock.tsx",
    "^next-intl/server$": "<rootDir>/test-utils/next-intl-server-mock.ts",
    "^next-intl/routing$": "<rootDir>/test-utils/next-intl-routing-mock.ts",
    "^next-intl/middleware$": "<rootDir>/test-utils/next-intl-middleware-mock.ts",
    "^@/i18n/navigation$": "<rootDir>/test-utils/i18n-navigation-mock.tsx",
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: { "^.+\\.tsx?$": tsJest },
  clearMocks: true,
};

const config: Config = {
  projects: [
    {
      ...shared,
      displayName: "node",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/__tests__/*.test.ts",
        "<rootDir>/__tests__/lib/**/*.test.ts",
        "<rootDir>/__tests__/api/**/*.test.ts",
      ],
    },
    {
      ...shared,
      displayName: "jsdom",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/__tests__/components/**/*.test.tsx"],
      setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
    },
  ],
};

export default config;
