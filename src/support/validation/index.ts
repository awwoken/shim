import { AppError } from "@/support/errors";
import * as v from "valibot";

type ParseJsonSchemaInput<TSchema extends v.GenericSchema> = {
  schema: TSchema;
  value: unknown;
  label: string;
  path: string;
};

export const parseJsonSchema = <TSchema extends v.GenericSchema>({
  schema,
  value,
  label,
  path,
}: ParseJsonSchemaInput<TSchema>): v.InferOutput<TSchema> => {
  const result = v.safeParse(schema, value);

  if (result.success) {
    return result.output;
  }

  throw new AppError(`Invalid ${label}`, `Repair or remove ${path}.`);
};
