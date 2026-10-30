/** App Store: a subscription group. Google Play: a subscription (`group_id` is its id in the store). */
export type ProductGroup = {
    group_id: string;
    group_name: string;
};

/** The server answers the create with the name only; the id is in the list. */
export type CreatedProductGroup = {
    group_name: string;
};
