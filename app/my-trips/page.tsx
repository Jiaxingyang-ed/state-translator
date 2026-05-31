"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SavedTrip = {
  routeId: string;
  userInput: string;
  scale: "tonight" | "weekend" | "travel" | "meal" | "book" | "corner";
  translation: string;
  optionId: "A" | "B";
  title: string;
  firstStep: {
    time: string;
    action: string;
    environment: string;
  } | null;
  createdAt: string;
};

type SavedTripsResponse =
  | {
      success: true;
      data: SavedTrip[];
    }
  | {
      error: string;
    };

export default function MyTripsPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      const fetchTrips = async () => {
        setIsLoading(true);
        setError(null);

        try {
          const anonymousId = getOrCreateAnonymousId();
          const response = await fetch(
            `/api/saved-trips?anonymous_id=${encodeURIComponent(anonymousId)}`,
          );
          const result = (await response.json()) as SavedTripsResponse;

          if (!response.ok || "error" in result) {
            throw new Error(
              "error" in result ? result.error : "读取保存行程失败",
            );
          }

          setTrips(result.data);
        } catch (caughtError) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "读取保存行程失败",
          );
        } finally {
          setIsLoading(false);
        }
      };

      void fetchTrips();
    });
  }, []);

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#fbfaf7_0%,#edf5f1_48%,#f8eee5_100%)] px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <p className="mb-3 text-sm text-[#7d746b]">我的行程</p>
          <h1 className="text-4xl font-light leading-tight text-[#29231f]">
            保存下来的路线
          </h1>
        </div>

        {isLoading ? (
          <div className="rounded-lg border border-white/70 bg-white/75 p-7 text-[#655b52] shadow-sm">
            加载中...
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-[#eadfd4] bg-white/85 p-7 text-[#655b52] shadow-sm">
            {error}
          </div>
        ) : null}

        {!isLoading && !error && trips.length === 0 ? (
          <div className="rounded-lg border border-[#eadfd4] bg-white/85 p-7 text-[#655b52] shadow-sm">
            还没有保存的行程。
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2">
          {trips.map((trip) => (
            <article
              key={`${trip.routeId}-${trip.optionId}`}
              className="rounded-lg border border-[#e8ded2] bg-white/85 p-5 shadow-sm backdrop-blur"
            >
              <p className="mb-2 text-sm text-[#2e4d48]">
                {trip.optionId === "A" ? "A 安抚型" : "B 微突破型"} ·{" "}
                {getScaleLabel(trip.scale)}
              </p>
              <h2 className="text-2xl font-light text-[#29231f]">
                {trip.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#655b52]">
                {trip.translation}
              </p>
              {trip.firstStep ? (
                <div className="mt-4 rounded-lg border border-[#efe5db] bg-[#fffdfa] p-4">
                  <p className="mb-2 text-sm text-[#9b6b55]">
                    {trip.firstStep.time}
                  </p>
                  <p className="text-sm leading-6 text-[#29231f]">
                    {trip.firstStep.action}
                  </p>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => router.push(`/step2?routeId=${trip.routeId}`)}
                className="mt-5 w-full rounded-lg bg-[#2e4d48] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#243f3b]"
              >
                查看完整路线
              </button>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}

function getScaleLabel(scale: SavedTrip["scale"]) {
  const labels: Record<SavedTrip["scale"], string> = {
    tonight: "今晚",
    weekend: "周末",
    travel: "旅行",
    meal: "一顿饭",
    book: "一本书",
    corner: "一个角落",
  };

  return labels[scale];
}

function getOrCreateAnonymousId() {
  const storageKey = "anonymous_id";
  const legacyStorageKey = "state_translator_anonymous_id";
  const existingId =
    localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey);

  if (existingId) {
    localStorage.setItem(storageKey, existingId);
    return existingId;
  }

  const newId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  localStorage.setItem(storageKey, newId);
  localStorage.setItem(legacyStorageKey, newId);

  return newId;
}
