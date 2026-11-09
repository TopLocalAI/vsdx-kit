import ELKApi, { type ElkExtendedEdge, type ElkNode } from "elkjs/lib/elk-api.js";

/** Minimal ELK JSON types used here (elkjs ships its own in elk-api.d.ts). */
export type { ElkExtendedEdge, ElkNode };

// elkjs's default entry probes for web workers at import time and breaks under
// some bundlers, so the API is wired to the shipped in-process worker by hand.
// That worker file decides how to export itself by looking at the globals:
// when `self` exists it assumes it runs inside a real web worker and exports
// nothing, so the global is hidden while the module evaluates.
type WorkerConstructor = new (url?: string) => Worker;

async function loadFakeWorker(): Promise<WorkerConstructor> {
  const globals = globalThis as { self?: unknown };
  const hadSelf = "self" in globals;
  const savedSelf = globals.self;
  if (hadSelf) {
    try {
      delete globals.self;
    } catch {
      globals.self = undefined;
    }
  }
  let loaded: unknown;
  try {
    loaded = await import("elkjs/lib/elk-worker.min.js");
  } finally {
    if (hadSelf) globals.self = savedSelf;
  }
  const namespace = loaded as { Worker?: unknown; default?: { Worker?: unknown } | unknown };
  const candidates = [
    namespace.Worker,
    (namespace.default as { Worker?: unknown } | undefined)?.Worker,
    namespace.default,
  ];
  const ctor = candidates.find((item) => typeof item === "function");
  if (!ctor) throw new Error("The ELK layout worker could not be loaded.");
  return ctor as WorkerConstructor;
}

let elkInstance: Promise<InstanceType<typeof ELKApi>> | null = null;

/** Shared in-process ELK instance. */
export function elk(): Promise<InstanceType<typeof ELKApi>> {
  elkInstance ??= loadFakeWorker().then((FakeWorker) => {
    const Elk = ELKApi as unknown as new (opts: {
      workerFactory: () => Worker;
    }) => InstanceType<typeof ELKApi>;
    return new Elk({ workerFactory: () => new FakeWorker() });
  });
  return elkInstance;
}
