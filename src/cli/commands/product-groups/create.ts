import { Flags } from '@oclif/core';

import { productStores } from '../../../sdk/adapty/index.js';
import { validateCreateProductGroup } from '../../../sdk/adapty/product-groups/index.js';
import { assertValid } from '../../../sdk/core/validation.js';
import { AdaptyCommand } from '../../base/adapty/index.js';
import { appIdFlag } from '../../input/app.js';
import { renderRecord } from '../../views/record.js';

import type { CreatedProductGroup, CreateProductGroupInput } from '../../../sdk/adapty/index.js';

export default class ProductGroupsCreate extends AdaptyCommand {
    static override description
        = 'Create an App Store subscription group; the server refuses Google Play. '
            + 'The new group\'s id is read from the list after the create.';

    static override examples = ['<%= config.bin %> product-groups create --app 550e8400-... --store app_store --name "Premium"'];

    static override flags = {
        ...appIdFlag,
        name: Flags.string({ description: 'Group name', required: true }),
        store: Flags.option({ description: 'Store to create the group in', options: productStores, required: true })(),
    };

    async run(): Promise<CreatedProductGroup> {
        const { flags } = await this.parse(ProductGroupsCreate);
        const input: CreateProductGroupInput = { name: flags.name, store: flags.store };

        assertValid(validateCreateProductGroup(input));

        const group = await this.adapty.productGroups.create(flags.app, input);

        this.log(group.group_id === null
            ? 'Group created; its id is not in the list yet, run `product-groups list`.'
            : 'Group created!');

        this.render(group, renderRecord);

        return group;
    }
}
