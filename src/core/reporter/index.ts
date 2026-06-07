export type Reporter = {
  info: (message: string) => void;
};

export const silentReporter: Reporter = {
  info: () => {},
};
