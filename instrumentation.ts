export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { onServerBoot } = await import("./lib/server/boot");
    await onServerBoot();
  }
}
