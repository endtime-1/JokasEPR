export const ENVIRONMENTS = ["development", "test", "production"] as const;

export type EnvironmentName = (typeof ENVIRONMENTS)[number];

export type ClientEnvironment = {
  apiUrl: string;
  environment: EnvironmentName;
};
