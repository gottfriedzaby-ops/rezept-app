"use client";

import { useState } from "react";
import ImportUrl from "@/components/ImportUrl";
import ImportYoutube from "@/components/ImportYoutube";
import ImportPhoto from "@/components/ImportPhoto";

type Tab = "url" | "youtube" | "photo";

const TABS: { id: Tab; label: string }[] = [
  { id: "url", label: "Website URL" },
  { id: "youtube", label: "YouTube" },
  { id: "photo", label: "Foto" },
];

export default function ImportTabs() {
  const [active, setActive] = useState<Tab>("url");

  return (
    <div className="max-w-xl">
      <div className="flex border-b border-gray-200 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === "url" && <ImportUrl />}
      {active === "youtube" && <ImportYoutube />}
      {active === "photo" && <ImportPhoto />}
    </div>
  );
}
