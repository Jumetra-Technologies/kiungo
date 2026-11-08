import { useEffect } from "react";
import { Button } from "@kiungo/ui";
import { useRunStore } from "./store/run-store";

export function App() {
  const { state, version, setVersion, setState } = useRunStore();

  useEffect(() => {
    void window.kiungo.appVersion().then(setVersion);
  }, [setVersion]);

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Kiungo</h1>
      <p>
        Version {version ?? "..."} · Run state: {state}
      </p>
      <Button onClick={() => void window.kiungo.runStart().then(setState)}>Run</Button>{" "}
      <Button onClick={() => void window.kiungo.runStop().then(setState)}>Stop</Button>{" "}
      <Button variant="danger" onClick={() => void window.kiungo.emergencyStop().then(setState)}>
        Emergency stop
      </Button>
    </main>
  );
}
