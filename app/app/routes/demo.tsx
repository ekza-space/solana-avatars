import { json, type MetaFunction } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { Card, Notice, Page, PageHeader, Section } from "~/components/ui";
import { demoEnabled } from "~/lib/studio-demo.server";

export const meta: MetaFunction = () => [
  { title: "Demo rehearsal · Ekza Avatar Studio" },
  { name: "robots", content: "noindex, nofollow" },
];

export function loader() {
  if (!demoEnabled()) throw new Response("Not found", { status: 404 });
  return json(
    {
      sample: Boolean(process.env.EKZA_STUDIO_DEMO_SOURCE),
      cover: Boolean(process.env.EKZA_STUDIO_DEMO_THUMBNAIL),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

const steps = [
  {
    title: "1. Enter as a creator",
    text: "Create an ordinary account with email and password, or use the creator account from the launcher's private demo.json. No wallet or SOL is needed.",
    to: "/studio?view=account",
    action: "Open account",
  },
  {
    title: "2. Submit the sample",
    text: "Upload Robert.vrm, optionally add its cover, give this submission a unique name and retain the original model's usage terms. Submit and follow its preparation in My uploads.",
    to: "/studio?view=new",
    action: "Upload avatar",
  },
  {
    title: "3. Review as the curator",
    text: "Use a second browser profile or a private window and sign in with the reviewer's account. Check the exact version, VRM preview and iPhone file, then Approve. Two ordinary tabs share one account.",
    to: "/studio?view=review",
    action: "Open review queue",
  },
  {
    title: "4. Discover and save",
    text: "Return to the creator's browser. The approved version is now public. Save it to My library. An unapproved upload must not appear in Discover.",
    to: "/studio?view=catalog",
    action: "Open Discover",
  },
  {
    title: "5. Take it into Space and Mirror",
    text: "Choose Open in Space on the approved card. In Mirror, select this demo's backend, sign in with the same email and open the saved avatar. A physical iPhone needs the launcher's explicit LAN mode; localhost on the phone is not this Mac.",
    to: "/studio?view=library",
    action: "Open My library",
  },
] as const;

export default function Demo() {
  const { sample, cover } = useLoaderData<typeof loader>();
  return (
    <Page>
      <PageHeader
        eyebrow="Local rehearsal · Web2"
        title="One complete publishing journey."
        lede="Creator → preparation → curator approval → catalog → Mirror + Space. This guide is enabled only by the local demo launcher."
        actions={
          <Link to="/studio" className="ui-button">
            Open Studio
          </Link>
        }
      />
      <Section title="Prepared demo model">
        <Card className="space-y-4 p-5">
          <p className="ui-copy-sm">
            Robert is the rehearsed sample. Its exact VRM hash is checked before
            a prepared iPhone conversion is reused and validated. This shows the
            real publication and approval flow; it does not prove that every
            arbitrary VRM converts on this Mac. Rehearse any other model before
            presenting it.
          </p>
          {sample ? (
            <div className="flex flex-wrap gap-3">
              <a href="/demo/sample?kind=source" className="ui-button" download>
                Download Robert.vrm
              </a>
              {cover ? (
                <a
                  href="/demo/sample?kind=thumbnail"
                  className="ui-button ui-button-secondary"
                  download
                >
                  Download cover
                </a>
              ) : null}
            </div>
          ) : (
            <Notice tone="error">
              The prepared sample is not available. Check the launcher before
              presenting.
            </Notice>
          )}
        </Card>
      </Section>
      <Section title="Rehearse in two browser profiles">
        <div className="grid gap-5 md:grid-cols-2">
          {steps.map((step) => (
            <Card className="flex flex-col items-start gap-4 p-5" key={step.to}>
              <h2 className="ui-h3">{step.title}</h2>
              <p className="ui-copy-sm flex-1">{step.text}</p>
              <Link className="ui-button ui-button-secondary" to={step.to}>
                {step.action}
              </Link>
            </Card>
          ))}
        </div>
      </Section>
      <Section title="Before the presentation">
        <Notice>
          Check the VRM preview and Space in the browser you will present from;
          test Mirror on the actual iPhone. Keep this Mac and Docker running. Do
          not show demo.json on the projector: it contains passwords. Approval
          is curator moderation, not an NFT mint or an on-chain ownership claim.
        </Notice>
      </Section>
    </Page>
  );
}
