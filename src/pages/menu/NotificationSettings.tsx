// artifacts/knoxit/src/pages/menu/NotificationSettings.tsx
// Route: /menu/notifications
import { useState } from "react";
import { SubHeader } from "../../components/Header";

const initialPrefs = {
  pickLockReminders: true,
  resultAlerts: true,
  chatMessages: true,
  friendsLeagueRequests: true,
};

const labels: Record<keyof typeof initialPrefs, { title: string; desc: string }> = {
  pickLockReminders: { title: "Pick Lock Reminders", desc: "Get notified before your picks lock in" },
  resultAlerts: { title: "Result Alerts", desc: "Know instantly when a match affecting you finishes" },
  chatMessages: { title: "Chat Messages", desc: "New messages in your leagues' chat" },
  friendsLeagueRequests: { title: "Friends League Requests", desc: "When someone requests to join your league" },
};

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors ${on ? "bg-emerald-500" : "bg-white/10"}`}
    >
      <div className={`w-5 h-5 rounded-full bg-white transition-transform ${on ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState(initialPrefs);

  const toggle = (key: keyof typeof initialPrefs) => {
    // TODO: replace with PATCH /api/account/notifications { [key]: !prefs[key] }
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  };

  return (
    <>
      <SubHeader title="Notifications" onBack={() => window.history.back()} />
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-2 pb-4">
        <div className="bg-white/[0.03] border border-white/10 rounded-xl divide-y divide-white/5">
          {(Object.keys(initialPrefs) as Array<keyof typeof initialPrefs>).map((key) => (
            <div key={key} className="flex items-center justify-between px-3 py-3">
              <div className="pr-3">
                <div className="text-white text-[13px] font-medium">{labels[key].title}</div>
                <div className="text-zinc-500 text-[12px] mt-0.5">{labels[key].desc}</div>
              </div>
              <Toggle on={prefs[key]} onClick={() => toggle(key)} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
