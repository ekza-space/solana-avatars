import { Link } from "@remix-run/react";
import { Page, PageHeader, Section } from "~/components/ui";
import { studioHref } from "~/lib/routes";

const steps = [
  {
    n: "01",
    title: "Create an Ekza account",
    body: "Register with email and password. The same account holds your uploads and saved library in Studio and Mirror.",
    to: studioHref("account"),
    cta: "Open your account",
  },
  {
    n: "02",
    title: "Upload and review",
    body: "Upload a humanoid VRM and its usage terms. Processing prepares the iPhone version; the curator checks the model before it can be published.",
    to: studioHref("new"),
    cta: "Upload an avatar",
  },
  {
    n: "03",
    title: "Use the approved version",
    body: "Save published avatars to your library and sign in to Mirror with the same email. Open an avatar's Use in Space button to try that published version in the configured Space.",
    to: studioHref("catalog"),
    cta: "Discover avatars",
  },
];

export default function About() {
  return (
    <Page>
      <PageHeader
        eyebrow="Ekza · Avatar Studio"
        title={
          <>
            Your avatar.
            <br />
            One ordinary account.
          </>
        }
        lede="Publish a model, get it reviewed, and take its approved version into Mirror and Space. No crypto wallet is required."
      />
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to={studioHref("catalog")} className="ui-button">
          Discover avatars
        </Link>
        <Link
          to={studioHref("account")}
          className="ui-button ui-button-secondary"
        >
          Sign in or create account
        </Link>
      </div>
      <Section title="How it works">
        <div className="grid gap-px bg-[rgb(var(--line))] md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.n}
              className="flex flex-col gap-3 bg-[rgb(var(--bg))] p-6"
            >
              <span className="ui-index">{step.n}</span>
              <h2 className="ui-h3">{step.title}</h2>
              <p className="ui-copy-sm">{step.body}</p>
              <Link to={step.to} className="ui-link mt-auto pt-3">
                {step.cta} →
              </Link>
            </div>
          ))}
        </div>
      </Section>
      <Section title="A clear publishing boundary">
        <p className="ui-copy max-w-3xl">
          Drafts and models awaiting review stay private. Technical checks do
          not replace the curator&apos;s decision. Each update is a separate version;
          only the approved version appears in the public catalog and library.
        </p>
      </Section>
      <Section title="Web3 is optional">
        <p className="ui-copy max-w-3xl">
          Earlier Solana minting and on-chain profile tools live in a separate
          experimental area. They are not an alternative login for your Ekza
          account yet, and do not replace publication review.
        </p>
        <Link to="/web3" className="ui-link mt-4 inline-block">
          Explore the Web3 experiments →
        </Link>
      </Section>
    </Page>
  );
}
