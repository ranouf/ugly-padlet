import process from "node:process";

const repository = process.env["GITHUB_REPOSITORY"] || "ranouf/ugly-padlet";
const token = process.env["GITHUB_TOKEN"];
const branch = process.env["GITHUB_BRANCH"] || "main";
const requiredCheck =
  process.env["GITHUB_REQUIRED_CHECK"] || "Validate Chrome Extension";
const headers = {
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
  "x-github-api-version": "2022-11-28",
};

if (!token) {
  console.error(
    "Missing GITHUB_TOKEN. Use a token with Administration: Read and write on this repository.",
  );
  process.exit(1);
}

await assertGitHubAccess(
  `https://api.github.com/repos/${repository}`,
  `Cannot access repository ${repository}. Check that the token belongs to an admin of this repository and that the repository is selected in the token permissions.`,
);

await assertGitHubAccess(
  `https://api.github.com/repos/${repository}/branches/${branch}`,
  `Cannot access branch ${repository}:${branch}. Check that the branch exists and that the token can read it.`,
);

const response = await fetch(
  `https://api.github.com/repos/${repository}/branches/${branch}/protection`,
  {
    method: "PUT",
    headers,
    body: JSON.stringify({
      required_status_checks: {
        strict: true,
        checks: [
          {
            context: requiredCheck,
            app_id: 15368,
          },
        ],
      },
      enforce_admins: false,
      required_pull_request_reviews: {
        required_approving_review_count: 0,
        dismiss_stale_reviews: false,
        require_code_owner_reviews: false,
        require_last_push_approval: false,
      },
      restrictions: null,
      required_linear_history: false,
      allow_force_pushes: false,
      allow_deletions: false,
      block_creations: false,
      required_conversation_resolution: false,
      lock_branch: false,
      allow_fork_syncing: true,
    }),
  },
);

if (!response.ok) {
  console.error(
    `GitHub branch protection update failed: ${response.status} ${response.statusText}`,
  );
  console.error(await response.text());
  if (response.status === 404) {
    console.error(
      "GitHub returns 404 for private or admin-only resources when the token is missing repository access or Administration: Read and write.",
    );
  }
  process.exit(1);
}

console.log(
  `${repository}:${branch} is protected. Required check: ${requiredCheck}`,
);

/**
 * @param {string} url
 * @param {string} message
 */
async function assertGitHubAccess(url, message) {
  const response = await fetch(url, { headers });
  if (response.ok) return;

  console.error(`${message}`);
  console.error(
    `GitHub API returned ${response.status} ${response.statusText}`,
  );
  console.error(await response.text());
  process.exit(1);
}
