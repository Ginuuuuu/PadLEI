import toast from "react-hot-toast";

export function handleSnapshotError(error: unknown, label = "data") {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Firestore listener failed for ${label}:`, error);

  if (message.toLowerCase().includes("permission")) {
    toast.error("Firebase permissions are blocking this data. Deploy the latest Firestore rules.");
    return;
  }

  toast.error(`Could not load ${label}.`);
}
