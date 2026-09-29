import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useSession } from "../lib/auth";
import { isDemo } from "../lib/api";
import { api } from "../lib/request";
export function ReviewForm({ productId }: { productId: string }) {
  const session = useSession();
  const [name, setName] = useState(""),
    [rating, setRating] = useState(5),
    [body, setBody] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      api(`/api/reviews/${productId}`, {
        method: "POST",
        body: JSON.stringify({ name, rating, body }),
      }),
  });
  if (isDemo) return null;
  if (!session.data?.user)
    return (
      <p>
        <Link to="/account">Sign in</Link> to review a completed purchase.
      </p>
    );
  if (mutation.isSuccess)
    return (
      <p role="status">
        Thank you. Your review has been submitted for moderation.
      </p>
    );
  return (
    <form
      className="review-form"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <h3>Share your experience</h3>
      <label>
        Display name
        <input
          required
          minLength={2}
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Rating
        <select
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} stars
            </option>
          ))}
        </select>
      </label>
      <label>
        Your review
        <textarea
          required
          minLength={10}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      {mutation.isError && <p role="alert">{mutation.error.message}</p>}
      <button className="button" disabled={mutation.isPending}>
        Submit for moderation
      </button>
    </form>
  );
}
