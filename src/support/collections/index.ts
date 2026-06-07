const EMPTY_COLLECTION_LENGTH = 0;
const SINGLE_ITEM_COLLECTION_LENGTH = 1;

export const isEmptyArray = <T>(items: readonly T[]): boolean =>
  items.length === EMPTY_COLLECTION_LENGTH;

export const hasOneItem = <T>(items: readonly T[]): boolean =>
  items.length === SINGLE_ITEM_COLLECTION_LENGTH;
