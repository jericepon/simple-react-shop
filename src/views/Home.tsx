import { useIdempotentFetch } from "@/hooks/useIdempotentFetch";
import { useEffect } from "react";

interface UserProfile {
 id: string;
 name: string;
 email: string;
}

// Explicitly define your argument types outside or pass them cleanly
type FetchArgs = [userId: number];

const Home = () => {
  const { state, initialize, refetch, instance } = useIdempotentFetch<UserProfile, FetchArgs>({
    name: 'getUserProfile',
    fetch: async (userId: number) => {
      const res = await fetch(`https://jsonplaceholder.typicode.com/users/${userId}`);
      if (!res.ok) throw new Error;
      return res.json();
    }
  });

  useEffect(() => {
    // Pass the required parameter safely
    initialize(1).catch((err) => {
      console.error("Initialization failed:", err);
    });
  }, [initialize]); // Added initialize to dependency array for React best practices

  return (
    <div>
      <button onClick={() => refetch(false, 1)}>Refetch</button>
      {state === 'loading' && <p>Loading user profile...</p>}
      {state === 'ready' && <p>Initializing connection...</p>}
      {state === 'error' && <p>Something went wrong.</p>}

      {state === 'complete' && (
        <div>
          {instance?.name}
          {instance?.email}
        </div>
      )}
    </div>
  );
}

export default Home;
