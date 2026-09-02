import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Next 16 blocks cross-origin requests for dev resources by default. Testing
   * inside Nimiq Pay means loading the app from this machine's LAN address, not
   * localhost, so without this the JS chunks are refused, React never hydrates,
   * and every button silently does nothing.
   *
   * Dev-only setting; it has no effect on a production build.
   */
  allowedDevOrigins: ["192.168.0.200", "192.168.0.*", "localhost"],
};

export default nextConfig;
