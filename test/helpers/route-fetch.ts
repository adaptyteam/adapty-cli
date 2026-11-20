import * as sinon from 'sinon';

/** One answer of a route: a JSON body with a status, a status whose body is lost on the way, or no response at all. */
export type RouteAnswer = { body: unknown; status?: number } | { lostBody: true; status: number } | { network: true };

export type Route = {
    /** The answers in order; the last one repeats. */
    answers: RouteAnswer[];
    method: string;
    /** Matched against the URL path. */
    path: RegExp;
};

export type SentRequest = { body: unknown; method: string; path: string };

/**
 * A fetch stub that answers by method and path, and records every request with its body (JSON parsed,
 * FormData kept). A request no route expects answers 418, so a test never passes on a stray call.
 */
export const routeFetch = (routes: readonly Route[]): { sent: SentRequest[]; stub: sinon.SinonStub } => {
    const sent: SentRequest[] = [];
    const used = new Map<Route, number>();

    const stub = sinon.stub(globalThis, 'fetch').callsFake((input, init) => {
        const method = init?.method ?? 'GET';
        const { pathname } = new URL(String(input instanceof Request ? input.url : input));
        const raw = init?.body;

        sent.push({ body: typeof raw === 'string' ? JSON.parse(raw) as unknown : raw, method, path: pathname });

        const route = routes.find(candidate => candidate.method === method && candidate.path.test(pathname));

        if (route === undefined) {
            return Promise.resolve(new Response(JSON.stringify({ error: `no route for ${method} ${pathname}` }), { status: 418 }));
        }

        const index = used.get(route) ?? 0;
        const answer = route.answers[Math.min(index, route.answers.length - 1)];

        used.set(route, index + 1);

        if (answer === undefined || 'network' in answer) {
            return Promise.reject(new TypeError('fetch failed'));
        }

        if ('lostBody' in answer) {
            const body = new ReadableStream<Uint8Array>({
                pull: (controller) => {
                    controller.error(new TypeError('terminated'));
                },
            });

            return Promise.resolve(new Response(body, { headers: { 'content-type': 'application/json' }, status: answer.status }));
        }

        return Promise.resolve(new Response(JSON.stringify(answer.body), {
            headers: { 'content-type': 'application/json' },
            status: answer.status ?? 200,
        }));
    });

    return { sent, stub };
};
