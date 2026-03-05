"""
LinkedIn OAuth2 helper — run once to get an access token.

Usage:
  python scripts/linkedin_auth.py
"""
import http.server
import os
import threading
import urllib.parse
import urllib.request
import webbrowser
import json

CLIENT_ID = os.environ["LINKEDIN_CLIENT_ID"]
CLIENT_SECRET = os.environ["LINKEDIN_CLIENT_SECRET"]
REDIRECT_URI = "http://localhost:8000/callback"
SCOPE = "r_liteprofile w_member_social"

auth_code = None


class CallbackHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        if "code" in params:
            auth_code = params["code"][0]
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"<h1>Auth complete! You can close this tab.</h1>")
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"<h1>Error: no code received</h1>")

    def log_message(self, format, *args):
        pass  # suppress server logs


def main():
    global auth_code

    # Start local server
    server = http.server.HTTPServer(("localhost", 8000), CallbackHandler)
    thread = threading.Thread(target=server.handle_request)
    thread.start()

    # Open browser for auth
    auth_url = (
        "https://www.linkedin.com/oauth/v2/authorization"
        f"?response_type=code"
        f"&client_id={CLIENT_ID}"
        f"&redirect_uri={urllib.parse.quote(REDIRECT_URI)}"
        f"&scope={urllib.parse.quote(SCOPE)}"
    )
    print(f"Opening browser for LinkedIn auth...")
    webbrowser.open(auth_url)
    thread.join(timeout=120)

    if not auth_code:
        print("ERROR: No auth code received within 2 minutes.")
        return

    # Exchange code for token
    data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": auth_code,
        "redirect_uri": REDIRECT_URI,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }).encode()

    req = urllib.request.Request(
        "https://www.linkedin.com/oauth/v2/accessToken",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req) as resp:
        token_data = json.loads(resp.read())

    access_token = token_data.get("access_token")
    expires_in = token_data.get("expires_in", "unknown")
    print(f"\nAccess token (expires in {expires_in}s):")
    print(access_token)
    print("\nAdd this to your .env:")
    print(f"LINKEDIN_ACCESS_TOKEN={access_token}")


if __name__ == "__main__":
    main()
