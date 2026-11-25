import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hiring rounds are on the Candidates screen now: old links to their own page land there.
  // Campaigns are gone: a hiring round is the group of people now. Old links go to the templates.
  redirects: async () => [
    { source: "/recruitment/t/rounds", destination: "/recruitment/t/pipeline", permanent: false },
    { source: "/recruitment/campaigns/:path*", destination: "/recruitment/templates", permanent: false },
  ],
};

export default nextConfig;
