# ADR-053 — Oracle Always Free production hosting

Date: 20 November 2026

Status: Hosting approach approved by Sisir. The Micro passed the private Linux runtime trial. Production verification is pending.

## Decision

Use one Oracle Cloud Infrastructure Always Free Linux VM for the V1 production environment. This supersedes the AWS hosting targets in ADR-011. The owner expects up to five users during the initial launch and chose this approach for a zero recurring hosting charge.

Prefer one Ampere A1 Flex VM with capacity confirmed in the tenancy's home region. Run the Next.js web app and Express API as supervised Node.js 24 services behind one HTTPS endpoint. Keep Express on loopback. Review the HTTPS address, SSH access, renewal, and network rules before provisioning. Confirm the image, compute, storage, public IP and traffic allowances against the free-tier terms and the console.

Use a fresh production database with database-scoped Atlas credentials and the approved `prod/` prefix in the private R2 bucket. Keep the existing Gmail sender and verify mail delivery from the host. Prove Linux startup on the target CPU architecture with native dependencies and the shared API helper. Verify recurrence, purge, media cleanup, restart catch-up and failure visibility on the target. Store production data and deployment configuration so the VM can be rebuilt if Oracle reclaims idle free capacity.

The initial A1 launch in Hyderabad returned a capacity error. The owner launched an AMD `VM.Standard.E2.1.Micro` with 1 GB RAM for evaluation. On 21 November the owner reported that both apps passed the loopback smoke checks and five concurrent homepage requests with 551 MiB available RAM afterward. Verify signed-in use, provider connections and background work before opening production access.

The owner registered `make-my-marriage-easy.duckdns.org` and enabled Oracle ingress on TCP 80 and 443. On 21 November Codex verified that its A record points to the Oracle VM and that Caddy serves a fixed test message over HTTPS with a trusted Let's Encrypt certificate. Ubuntu's web rules and the Caddy service are enabled at startup. App routing and the production release are pending.

## Release flow

`DEV` remains the development branch. GitHub Actions checks the pull request and builds the merged `main` revision off the VM. The planned workflow transfers a Linux-compatible release with the locked dependencies and root API helper, activates the supervised services, and checks the public homepage and API. Keep the previous working release available for rollback. The HTTPS test endpoint is live. Provider-backed verification, pipeline implementation and public app routing are pending.

## Client IPs and authentication limits

Oracle's public ingress is Caddy. Keep the Next.js and Express listeners bound to `127.0.0.1` and set `API_BASE_URL=http://127.0.0.1:4000/api/v1` on the web service. In the public site's Caddy block, overwrite the private header using the address of the connection to Caddy.

```caddyfile
reverse_proxy 127.0.0.1:3000 {
  header_up X-MMM-Client-IP {http.request.remote.host}
}
```

Enable `TRUST_CADDY_CLIENT_IP=true` in both production services with that topology. The web relay forwards one valid IP only to the loopback auth API. Express uses it for the auth limit only if the next hop is `127.0.0.1`. The flag defaults to off and invalid or absent values fall back to the connection IP. Express retains the existing email and token limit keys, and IP limits retain IPv6 subnet grouping. Leaving the header overwrite in place protects against client-supplied header values. Verify the ingress trust chain again if another proxy is added or either app listener changes.

The approved single API process uses the existing in-memory limiter, with counters reset at restart. A deployment with multiple API processes requires a shared store before scaling.

## Data and credentials

- Start with a fresh `make_my_marriage_prod` Atlas database and a database-scoped user. Allow the VM's public IPv4 in the Atlas access list. The existing development data stays in its current database. If Sisir requests a data transfer later, define the exact records and associated uploads, take a backup and verify a dry run before importing.
- Configure the production Atlas connection, a fresh JWT signing secret, R2 credentials and the approved Gmail sender in restricted environment files on the VM. Use the existing private R2 bucket with the approved `prod/` prefix. Use a separate deployment credential for GitHub Actions. Store credential names and rotation steps in project notes and keep values in the relevant secret store or restricted environment file.

On 21 November Sisir and Codex verified the fresh production database from Oracle. The production user has database-specific `readWrite` and was denied access to development. The VM uses Atlas's SRV endpoint with TLS and the MongoDB driver's authentication negotiation. The connection is stored in `/etc/make-my-marriage/atlas.env` with root ownership and mode `0600`. The VM's `/32` entry is active. Replacing the existing project-wide rule and verifying local API access are still open before launch.

On 21 November Codex configured the approved Gmail sender, private R2 bucket credentials and fresh production JWT key in `/etc/make-my-marriage/providers.env` with root ownership and mode `0600`. Gmail SMTP authentication and R2 list access from Oracle passed. Sisir confirmed receiving the one direct SMTP test email from Oracle. Sisir added the production HTTPS origin to the bucket's CORS policy. Codex verified that R2 accepts upload preflights from the production and localhost origins and rejects an unlisted origin. The private startup trial passed using the existing web build with the four verified API dependency patches. Sisir uploaded a wedding cover using a synthetic account on the SSH-only preview. Codex confirmed authenticated access, the saved attachment and retrieval of the WebP through a fresh signed-in session. See the project status for the actual preview scope and remaining launch checks.

## Cost and expiry checks

| Service           | Check                                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Oracle Micro      | The Always Free compute allowance has no scheduled expiry. Oracle's optional promotional credits last up to 30 days. Confirm the exact trial deadline in the tenancy console and distinguish it from the Micro's Always Free eligibility. |
| Atlas and R2      | Atlas Free has no scheduled expiry. Monitor its storage and connection limits. R2 Standard free usage resets monthly. Check storage and request use in Cloudflare before launch.                                                          |
| DuckDNS and Caddy | DuckDNS is free. The observed Let's Encrypt certificate expires on 19 February 2027. Caddy manages renewal automatically. Verify the served certificate on the live hostname during follow-up.                                            |
| GitHub Actions    | Check the repository owner's compute and artifact allowances. Prefer standard Linux runners and short artifact retention for the planned release workflow.                                                                                |

## References

- [Oracle Always Free resources and limits](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Oracle account home region](https://docs.oracle.com/en/cloud/foundation/cloud_architecture/governance/regions.html)
- [Oracle Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm)
- [Atlas Free cluster](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [DuckDNS](https://www.duckdns.org/about.jsp)
- [Caddy certificate renewal](https://caddyserver.com/docs/automatic-https)
- [GitHub Actions allowances](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
