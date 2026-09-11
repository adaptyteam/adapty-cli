/**
 * Awaits a promise that must reject and hands back the error. Chai has no rejection
 * assertion without chai-as-promised, and a raw try/catch in every test hides the intent.
 */
export const rejection = async (promise: Promise<unknown>): Promise<unknown> => {
    try {
        await promise;
    } catch (error) {
        return error;
    }

    throw new Error('Expected the promise to reject, but it resolved');
};
