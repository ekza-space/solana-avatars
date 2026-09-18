import { Link } from "@remix-run/react";
import { Page, PageHeader, Section } from "~/components/ui";

const steps = [
  {
    n: "01",
    title: "Connect your Solana wallet",
    body: "Use a Solana wallet on Devnet. Signing in verifies your address; buying an avatar requires a separate transaction with test SOL.",
    to: "/passport#my-avatars",
    cta: "Open your avatars",
  },
  {
    n: "02",
    title: "Publish an avatar",
    body: "Upload your avatar, set its price and supply, and publish on Devnet. Each game needs a compatible model version before it can be listed as supported.",
    to: "/deployer?network=devnet",
    cta: "Upload an avatar",
  },
  {
    n: "03",
    title: "Use the approved version",
    body: "Buy a supported avatar, open your wallet library, and connect Space, Mirror or Omoba with the same wallet. Check each project badge before buying.",
    to: "/passport",
    cta: "Discover avatars",
  },
];

export default function About() {
  return (
    <Page>
      <PageHeader
        eyebrow="Ekza · Solana Devnet"
        title={
          <>
            Your avatar.
            <br />
            Your supported worlds.
          </>
        }
        lede="Publish an avatar, buy it with test SOL, and use its approved versions in supported projects."
      />
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to={"/passport"} className="ui-button">
          Discover avatars
        </Link>
        <Link
          to={"/passport#my-avatars"}
          className="ui-button ui-button-secondary"
        >
          My avatars
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
      <Section title="What this alpha includes">
        <p className="ui-copy max-w-3xl">
          The prepared Robert avatar supports Space, the internal Mirror Devnet demo, and Omoba.
          New avatars require compatible versions and review for each project.
          Mirror uses a separate test build for this demonstration; this is not the App Store purchase flow.
        </p>
      </Section>
    </Page>
  );
}
