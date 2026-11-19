import type { ImageFile, MessageWritePlan } from './model.js';

const png = (file: ImageFile): Blob => new Blob([new Uint8Array(file.bytes)], { type: 'image/png' });

/**
 * The multipart form of a create or an update: the JSON body in `data`, the header image in `image`
 * and the icons in the repeated `bullet_images`. Each icon part gets the next index, and the bullet
 * point it belongs to gets that index as `image_index`: the server pairs them only by the index, so
 * two icons in another order would otherwise land on the wrong bullet points.
 */
export const messageForm = (plan: MessageWritePlan): FormData => {
    const bullets = plan.data.bullet_points.map(bullet => ({ ...bullet }));
    const form = new FormData();

    for (const [index, icon] of plan.icons.entries()) {
        const bullet = bullets[icon.bullet];

        if (bullet !== undefined) {
            bullet.image_index = index;
        }
    }

    form.append('data', JSON.stringify({ ...plan.data, bullet_points: bullets }));

    if (plan.image !== undefined) {
        form.append('image', png(plan.image), plan.image.name);
    }

    for (const icon of plan.icons) {
        form.append('bullet_images', png(icon.file), icon.file.name);
    }

    return form;
};
