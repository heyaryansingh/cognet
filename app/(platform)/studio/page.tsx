type Props = { searchParams: Promise<{ url?: string }> };

export default async function StudioPage({ searchParams }: Props) {
  const url = (await searchParams).url;
  const valid = typeof url === "string" && /^https:\/\//.test(url) ? url : null;
  return <main className="mx-auto max-w-4xl p-6"><h1 className="text-2xl font-semibold">Work replay</h1><p className="mt-2 text-sm text-muted-foreground">Transcript exports remain in Supabase Storage; this viewer intentionally does not execute terminal recordings.</p><pre className="mt-6 overflow-x-auto rounded-lg bg-slate-950 p-5 font-mono text-sm text-emerald-300">{valid ? `$ curl ${valid}\n\nOpen the transcript URL above in your browser or storage client.` : "Add ?url=https://<storage transcript URL> to view a replay reference."}</pre></main>;
}
