import type { ProviderId } from "@/core/models";
import { npmProvider } from "@/providers/npm";
import { NPM_PROVIDER_ID } from "@/providers/npm/constants";
import type { ToolProvider } from "@/providers/types";
import { AppError } from "@/support/errors";

const PROVIDER_SPEC_PATTERN = /^([a-z][a-z0-9-]*):(?!\/\/)(.*)$/u;
const PROVIDER_SPEC_PROVIDER_MATCH_INDEX = 1;
const PROVIDER_SPEC_VALUE_MATCH_INDEX = 2;

const providers: Record<ProviderId, ToolProvider> = {
  [NPM_PROVIDER_ID]: npmProvider,
};

export const DEFAULT_PROVIDER_ID: ProviderId = NPM_PROVIDER_ID;

export const getProvider = (providerId: ProviderId): ToolProvider => {
  const provider = providers[providerId];

  if (provider === undefined) {
    throw new AppError(
      `Unsupported provider ${providerId}`,
      `Use one of: ${Object.keys(providers).join(", ")}`,
    );
  }

  return provider;
};

export const getDefaultProvider = (): ToolProvider =>
  getProvider(DEFAULT_PROVIDER_ID);

export type ProviderSelection = {
  provider: ToolProvider;
  spec: string;
  explicit: boolean;
};

export const selectProviderForSpec = (spec: string): ProviderSelection => {
  const match = spec.match(PROVIDER_SPEC_PATTERN);

  if (match === null) {
    return { provider: getDefaultProvider(), spec, explicit: false };
  }

  const providerId = match[PROVIDER_SPEC_PROVIDER_MATCH_INDEX];
  const providerSpec = match[PROVIDER_SPEC_VALUE_MATCH_INDEX];

  if (providerId === undefined || providerSpec === undefined) {
    return { provider: getDefaultProvider(), spec, explicit: false };
  }

  if (providerSpec === "") {
    throw new AppError(
      `Missing spec after provider ${providerId}`,
      `Use ${providerId}:<package-spec>.`,
    );
  }

  return {
    provider: getProvider(providerId),
    spec: providerSpec,
    explicit: true,
  };
};
