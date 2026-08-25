import { Link } from "@remix-run/react";

import { useSolanaNetwork } from "~/lib/network";
import { Page, Section } from "~/components/ui";

const steps = [
  {
    n: "01",
    title: "Mint an avatar",
    body: "Browse creator drops in the market, spin the model in 3D, mint the one you want straight into your wallet.",
    to: "/minter",
    cta: "Open the market",
  },
  {
    n: "02",
    title: "Make it your identity",
    body: "Create an on-chain profile: a handle, a short bio and the avatar NFT you just minted.",
    to: "/",
    cta: "Set up a profile",
  },
  {
    n: "03",
    title: "Publish your own",
    body: "Upload a .glb or .vrm model, set the supply and the mint fee, and deploy a collection anyone can mint from.",
    to: "/deployer",
    cta: "Deploy a collection",
  },
];

export default function About() {
  const { clusterLabel } = useSolanaNetwork();

  return (
    <Page>
      {/* Hero — the one loud statement on the site */}
      <section className="border-b border-[rgb(var(--line))] pb-10 pt-4 sm:pb-16">
        <div className="ui-eyebrow">Ekza · Solana {clusterLabel}</div>
        <h1 className="mt-6 font-display text-[clamp(2.75rem,9vw,7rem)] font-bold leading-[0.92] tracking-[-0.045em] text-[rgb(var(--text-strong))]">
          Your avatar,
          <br />
          <span className="bg-[rgb(var(--accent))] px-2 text-[rgb(var(--accent-ink))]">
            owned
          </span>{" "}
          not rented.
        </h1>
        <p className="ui-copy mt-8 max-w-2xl text-lg">
          Ekza turns 3D avatars into NFTs you actually hold: mint one, bind it
          to an on-chain profile, and carry the same character into any world
          that speaks the format.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/minter" className="ui-button">
            Explore the market
          </Link>
          <a
            href="https://space.ekza.io"
            target="_blank"
            rel="noopener noreferrer"
            className="ui-button ui-button-secondary"
          >
            Try it in Ekza Space ↗
          </a>
        </div>
      </section>

      <Section title="How it works">
        <div className="grid gap-px bg-[rgb(var(--line))] md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.n}
              className="flex flex-col gap-3 bg-[rgb(var(--bg))] p-6"
            >
              <span className="w-fit bg-[rgb(var(--accent))] px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.12em] text-[rgb(var(--accent-ink))]">
                {step.n}
              </span>
              <h3 className="ui-h2">{step.title}</h3>
              <p className="ui-copy-sm">{step.body}</p>
              <Link to={step.to} className="ui-link mt-auto pt-3 text-sm">
                {step.cta} →
              </Link>
            </div>
          ))}
        </div>
      </Section>

      <Section title="What lives on-chain">
        <dl className="grid gap-px bg-[rgb(var(--line))] sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              term: "Profile account",
              def: "Username, bio and the mint of the avatar you chose. Owned by your key, closable at any time.",
            },
            {
              term: "Collection registry",
              def: "Every published drop with its supply, mint fee and IPFS metadata pointer.",
            },
            {
              term: "The model itself",
              def: ".glb / .vrm pinned on IPFS and referenced from the NFT metadata as animation_url.",
            },
            {
              term: "Stellar link",
              def: "Optional provenance back to the Ekza universe an asset was released from.",
            },
          ].map((row) => (
            <div key={row.term} className="bg-[rgb(var(--bg))] p-5">
              <dt className="ui-label">{row.term}</dt>
              <dd className="ui-copy-sm mt-2">{row.def}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Where to go next">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <Link to="/minter" className="ui-link">
            Market
          </Link>
          <Link to="/" className="ui-link">
            Profile
          </Link>
          <Link to="/deployer" className="ui-link">
            Deploy
          </Link>
          <Link to="/users" className="ui-link">
            Users
          </Link>
          <a
            href="https://github.com/ekza-space/solana-avatars"
            target="_blank"
            rel="noopener noreferrer"
            className="ui-link"
          >
            Source on GitHub ↗
          </a>
        </div>
      </Section>
    </Page>
  );
}
