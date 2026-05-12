import type { Config } from "jest";

const tsJest = ["ts-jest", { tsconfig: "<rootDir>/tsconfig.jest.json" }] as const;

const shared = {
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
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
