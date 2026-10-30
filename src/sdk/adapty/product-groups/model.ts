/** App Store: a subscription group. Google Play: a subscription (`group_id` is its id in the store). */
export type ProductGroup = {
    group_id: string;
    group_name: string;
};

/** The id is null only if the new group is not in the list a moment after the create. */
export type CreatedProductGroup = {
    group_id: null | string;
    group_name: string;
};
