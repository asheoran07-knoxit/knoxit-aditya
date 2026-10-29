// artifacts/knoxit/src/pages/menu/StaticPages.tsx
// Routes: /menu/how-to-play, /menu/faq, /menu/terms, /menu/privacy, /menu/support, /menu/about
import { SubHeader } from "../../components/Header";

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <SubHeader title={title} onBack={() => window.history.back()} />
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-2 pb-6 text-zinc-300 text-[13px] leading-relaxed space-y-4">
        {children}
      </div>
    </>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-white text-[13px] font-bold mb-1.5">{heading}</div>
      <div className="text-zinc-400 text-[12px] leading-relaxed">{children}</div>
    </div>
  );
}

export function HowToPlay() {
  return (
    <Page title="How to Play">
      <div className="text-white text-[15px] font-extrabold">Survivor</div>
      <Section heading="The Basics">
        Each Gameweek, pick one team you think will win their match. If your team wins, you survive to the next
        Gameweek. If they draw or lose, you're knocked out.
      </Section>
      <Section heading="Primary & Backup Picks">
        Your backup is NOT a second chance. If your primary team's match is played and they draw or lose, you're
        out, full stop. The backup only counts if your primary team's match is postponed or abandoned and isn't
        played that Gameweek; then your backup team's result is used instead.
      </Section>
      <Section heading="You Can't Repeat a Team">
        Once you've picked a team, you can't pick them again until you've used every team in the pool at least
        once. After that, the pool resets and any team becomes available again.
      </Section>
      <Section heading="Last Survivor Wins">
        The league continues, Gameweek after Gameweek, until one player remains. That survivor takes the vault.
      </Section>

      <div className="pt-2 text-white text-[15px] font-extrabold">Predictor</div>
      <Section heading="Predict Every Score">
        Predict the score of every match in the Gameweek. An exact score earns 5 points; the right result (win,
        draw or loss) with the wrong score earns 3.
      </Section>
      <Section heading="Joker & Wildcard">
        Each Gameweek you get one Joker and one Wildcard. The Joker doubles that match's points. The Wildcard
        gives you 2 points on that match even if your prediction is wrong. Each goes on a different match.
      </Section>
      <Section heading="Each Match Locks on Its Own">
        Every match locks 1 hour before its own kickoff, so you can keep predicting later matches after earlier
        ones have started. Once a match locks, everyone's predictions for it are revealed.
      </Section>
      <Section heading="6-Week Mini-Seasons">
        A Predictor league runs for 6 Gameweeks. Most points at the end wins. In public leagues the vault is
        split 60% / 30% / 10% between the top three. Ties are broken by exact scores, then correct results,
        then Joker points.
      </Section>

      <div className="pt-2 text-white text-[15px] font-extrabold">Boosters</div>
      <Section heading="Coming Soon">
        Boosters like Draw Shield, Team Recall and League Pulse are coming after the closed beta: small
        strategic edges, never a guaranteed win.
      </Section>
    </Page>
  );
}

export function FAQ() {
  const faqs = [
    { q: "What happens if my team's match is postponed?", a: "If your primary team's match is postponed or abandoned and not played that Gameweek, your backup team's result counts instead. Without a backup, your pick stays undecided until the match is played. The backup never helps if your primary match is played and they draw or lose." },
    { q: "Can I change my pick after submitting?", a: "Yes, up until the lock time for that Gameweek. Once locked, picks are final." },
    { q: "What's the difference between Survivor and Predictor?", a: "In Survivor you pick one winning team a week and a draw or loss knocks you out. In Predictor you predict every score for 6 Gameweeks and collect points; nobody gets knocked out." },
    { q: "How are Predictor points scored?", a: "5 points for an exact score, 3 for the right result. Your Joker doubles one match's points; your Wildcard gives 2 points on one match even if you're wrong." },
    { q: "When do Predictor matches lock?", a: "Each match locks 1 hour before its own kickoff. You can still predict later matches in the Gameweek after earlier ones have locked." },
    { q: "Can I see other players' predictions?", a: "Yes, once a match locks. Before that, predictions are private." },
    { q: "How is a Predictor vault paid out?", a: "In public Predictor leagues, after the 6th Gameweek the vault is split 60% / 30% / 10% between the top three. Ties are broken by exact scores, then correct results, then Joker points." },
    { q: "What's the difference between Friends Leagues and regular leagues?", a: "Regular leagues are public, chip-entry competitions anyone can join. Friends Leagues are created by a player, invite-only or request-to-join, with no entry fee or member cap." },
    { q: "Does Knoxit handle real money?", a: "Not this season. Everything runs on chips, which have no cash value. Any private arrangement in a Friends League's Entry Terms is strictly between its members, not through Knoxit." },
    { q: "I think I found a bug. What do I do?", a: "Head to Contact Support and describe what happened — screenshots help a lot." },
  ];
  return (
    <Page title="FAQ / Help Center">
      {faqs.map((f, i) => (
        <div key={i} className="border-b border-white/5 pb-4 last:border-0">
          <div className="text-white text-[13px] font-semibold mb-1">{f.q}</div>
          <div className="text-zinc-400 text-[12px]">{f.a}</div>
        </div>
      ))}
    </Page>
  );
}

export function TermsAndConditions() {
  return (
    <Page title="Terms & Conditions">
      <div className="text-zinc-500 text-[12px] italic mb-2">
        Placeholder text — replace with your actual reviewed Terms before launch. This is not legal advice.
      </div>
      <Section heading="1. Eligibility">Placeholder — age/region eligibility requirements go here.</Section>
      <Section heading="2. Chips Have No Cash Value">Chips are a virtual, in-app resource with no real-world monetary value and cannot be exchanged for cash.</Section>
      <Section heading="3. Friends Leagues">Any prize or stakes arrangement described in a Friends League's Entry Terms is strictly between its members. Knoxit does not set, collect, hold, or process any such arrangement.</Section>
      <Section heading="4. Account Termination">Placeholder — grounds for suspension/termination go here.</Section>
      <Section heading="5. Changes to These Terms">Placeholder — how and when terms may be updated.</Section>
    </Page>
  );
}

export function PrivacyPolicy() {
  return (
    <Page title="Privacy Policy">
      <div className="text-zinc-500 text-[12px] italic mb-2">
        Placeholder text — replace with your actual reviewed Privacy Policy before launch. This is not legal advice.
      </div>
      <Section heading="What We Collect">Placeholder — account info, gameplay data, device/usage data.</Section>
      <Section heading="How We Use It">Placeholder — running the game, fraud prevention, communications.</Section>
        <Section heading="Third Parties">Placeholder — Neon (database hosting), football-data.org (fixtures), the API host, email provider, and any ad network once integrated.</Section>
      <Section heading="Your Rights">Placeholder — access, correction, deletion (see Delete Account in the menu).</Section>
    </Page>
  );
}

export function ContactSupport() {
  return (
    <Page title="Contact Support">
      <Section heading="Email">support@knoxit.app (placeholder — replace with real address)</Section>
      <Section heading="Response Time">We aim to respond within 24–48 hours.</Section>
      <Section heading="Before You Write In">
        Check the FAQ first — many common questions (postponed matches, pick changes, Friends Leagues) are already answered there.
      </Section>
    </Page>
  );
}

export function About() {
  return (
    <Page title="About">
      <Section heading="Knoxit">A football survivor pool — last fan standing takes the vault.</Section>
      <Section heading="Version">v0.1.0 (Beta)</Section>
      <Section heading="Built for">Nigeria, Indonesia, Brazil, Kenya, Bangladesh, Philippines</Section>
    </Page>
  );
}
