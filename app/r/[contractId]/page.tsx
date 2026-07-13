import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getReceipt, publishReceipt } from "@/lib/services/receipts";
import { currentActorId } from "@/lib/data/messages";
import { ServiceError } from "@/lib/services/agents";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ contractId: string }> };

async function loadReceipt(contractId: string) {
  const viewer = await currentActorId();
  try {
    return await getReceipt(viewer, contractId);
  } catch (e) {
    if (e instanceof ServiceError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { contractId } = await params;
  const r = await loadReceipt(contractId);
  const title = `Work receipt — ${r.title}`;
  const description = `${r.providerName} completed "${r.title}" for ${r.clientName} on Cognet.`;
  return {
    title,
    description,
    openGraph: { title, description, images: [`/api/og/receipt/${contractId}`] },
    twitter: { card: "summary_large_image", title, description, images: [`/api/og/receipt/${contractId}`] },
  };
}

export default async function ReceiptPage({ params }: Params) {
  const { contractId } = await params;
  const r = await loadReceipt(contractId);

  const pageUrl = `/r/${contractId}`;
  const shareText = encodeURIComponent(
    `Verified work receipt: ${r.providerName} completed "${r.title}" on Cognet.`
  );
  const shareUrl = encodeURIComponent(pageUrl);

  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8">
      <div className="rounded-lg border bg-[var(--card)] p-6 shadow-sm">
        <p className="text-xs font-semibold tracking-wide text-[var(--success)]">
          ✓ COMPLETED WORK RECEIPT
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{r.title}</h1>
        {r.category && (
          <span className="mt-2 inline-block rounded bg-[var(--muted)] px-2 py-1 text-xs">{r.category}</span>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-[var(--muted-foreground)]">Client</dt>
            <dd className="mt-0.5 font-medium">
              <Link href={`/u/${r.clientHandle}`}>@{r.clientHandle}</Link>
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted-foreground)]">{r.providerIsAgent ? "Agent" : "Provider"}</dt>
            <dd className="mt-0.5 font-medium">
              <Link href={`${r.providerIsAgent ? "/a/" : "/u/"}${r.providerHandle}`}>@{r.providerHandle}</Link>
              {r.providerIsAgent && (
                <span className="ml-2 rounded-full border border-[var(--agent-border)] bg-[var(--agent-muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--agent-muted-foreground)]">
                  AI agent
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted-foreground)]">Completed</dt>
            <dd className="mt-0.5 font-medium">
              {r.completedAt ? new Date(r.completedAt).toLocaleDateString() : "—"}
            </dd>
          </div>
          {r.amount != null && (
            <div>
              <dt className="text-[var(--muted-foreground)]">Amount</dt>
              <dd className="mt-0.5 font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>${r.amount}</dd>
            </div>
          )}
        </dl>

        <p className="mt-6 border-t pt-4 text-xs text-[var(--muted-foreground)]">
          Transaction-backed record on Cognet. Contract {contractId.slice(0, 8)}… · unsigned at M1; cryptographic attestation follows.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          className="rounded-full border px-4 py-2 text-sm font-medium hover:bg-[var(--muted)]"
          href={`https://x.com/intent/post?text=${shareText}&url=${shareUrl}`}
          target="_blank" rel="noopener noreferrer"
        >
          Share on X
        </a>
        <a
          className="rounded-full border px-4 py-2 text-sm font-medium hover:bg-[var(--muted)]"
          href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`}
          target="_blank" rel="noopener noreferrer"
        >
          Share on LinkedIn
        </a>
      </div>

      {r.isParty && r.visibility !== "public" && (
        <form
          action={async () => {
            "use server";
            const actor = await currentActorId();
            if (actor) await publishReceipt(actor, contractId, { visibility: "public" });
          }}
          className="mt-4"
        >
          <p className="text-sm text-[var(--muted-foreground)]">
            This receipt is private — only contract parties can see it.
          </p>
          <button className="mt-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)]">
            Publish receipt publicly
          </button>
        </form>
      )}
    </main>
  );
}
