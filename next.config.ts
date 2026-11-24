import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hiring rounds are on the Candidates screen now: old links to their own page land there.
  redirects: async () => [{ source: "/recruitment/t/rounds", destination: "/recruitment/t/pipeline", permanent: false }],
};

export default nextConfig;
