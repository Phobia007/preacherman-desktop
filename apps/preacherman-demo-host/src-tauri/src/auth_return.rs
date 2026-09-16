use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager, Url};

const ADDRESS: &str = "127.0.0.1:43821";
const CALLBACK: &str = "http://127.0.0.1:43821/auth/callback";
const MAX_HEADERS: usize = 8192;

#[derive(Default)]
pub struct AuthReturnServer(Mutex<Option<Worker>>);
struct Worker {
    nonce: String,
    stop: Arc<AtomicBool>,
    thread: JoinHandle<()>,
}
impl Worker {
    fn stop(self) {
        self.stop.store(true, Ordering::Relaxed);
        let _ = self.thread.join();
    }
}

fn valid_nonce(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
}

// Authenticate the attempt before accepting any code. Only loopback origin-form GETs
// are supported; no CORS, credentials, arbitrary redirects or reflected HTML.
fn parse_request(request: &str, nonce: &str) -> Option<String> {
    if request.len() > MAX_HEADERS || !request.ends_with("\r\n\r\n") {
        return None;
    }
    let mut lines = request.split("\r\n");
    let parts: Vec<_> = lines.next()?.split_whitespace().collect();
    if parts.len() != 3
        || parts[0] != "GET"
        || parts[2] != "HTTP/1.1"
        || !parts[1].starts_with("/auth/callback?")
    {
        return None;
    }
    let mut hosts = 0;
    for line in lines.filter(|line| !line.is_empty()) {
        let (name, value) = line.split_once(':')?;
        if name.eq_ignore_ascii_case("host") {
            if value.trim() != ADDRESS {
                return None;
            }
            hosts += 1;
        }
        if name.eq_ignore_ascii_case("content-length")
            || name.eq_ignore_ascii_case("transfer-encoding")
        {
            return None;
        }
    }
    if hosts != 1 {
        return None;
    }
    let url = Url::parse(&format!("http://{ADDRESS}{}", parts[1])).ok()?;
    if url.path() != "/auth/callback" || url.fragment().is_some() {
        return None;
    }
    let pairs: Vec<_> = url.query_pairs().collect();
    let states: Vec<_> = pairs.iter().filter(|(k, _)| k == "desktop_state").collect();
    if states.len() != 1 || states[0].1 != nonce {
        return None;
    }
    let codes: Vec<_> = pairs.iter().filter(|(k, _)| k == "code").collect();
    let mut callback = Url::parse("preacherman://auth/callback").ok()?;
    if codes.is_empty() {
        // Supabase sends OAuth errors in a fragment, which HTTP never transmits.
        // A nonce-matched return without a code is a failed/denied attempt.
        callback
            .query_pairs_mut()
            .append_pair("error", "oauth_return_without_code");
    } else {
        let code = &codes[0].1;
        if codes.len() != 1
            || !(16..=256).contains(&code.len())
            || !code
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        {
            return None;
        }
        callback.query_pairs_mut().append_pair("code", code);
        let flows: Vec<_> = pairs.iter().filter(|(k, _)| k == "sb_flow_id").collect();
        if flows.len() > 1 {
            return None;
        }
        if let Some((_, flow)) = flows.first() {
            if !(8..=64).contains(&flow.len())
                || !flow
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
            {
                return None;
            }
            callback.query_pairs_mut().append_pair("sb_flow_id", flow);
        }
    }
    Some(callback.into())
}

fn read_headers(stream: &mut TcpStream, stop: &AtomicBool) -> Option<String> {
    stream
        .set_read_timeout(Some(Duration::from_millis(250)))
        .ok()?;
    let start = Instant::now();
    let mut bytes = Vec::new();
    let mut chunk = [0_u8; 1024];
    while start.elapsed() < Duration::from_secs(2) && !stop.load(Ordering::Relaxed) {
        let n = stream.read(&mut chunk).ok()?;
        if n == 0 || bytes.len() + n > MAX_HEADERS {
            return None;
        }
        bytes.extend_from_slice(&chunk[..n]);
        if bytes.ends_with(b"\r\n\r\n") {
            return String::from_utf8(bytes).ok();
        }
    }
    None
}

fn respond(stream: &mut TcpStream, accepted: bool, light: bool) {
    let status = if accepted {
        "200 OK"
    } else {
        "400 Bad Request"
    };
    let (title, message) = if accepted {
        (
            "Returning to Preacherman",
            "Continue in the desktop app. You can close this tab.",
        )
    } else {
        (
            "Sign-in link unavailable",
            "Start a new sign-in from Preacherman Desktop.",
        )
    };
    let appearance = if light { "light" } else { "dark" };
    let body = format!(
        r#"<!doctype html><html lang="en" data-appearance="{appearance}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Preacherman</title><style>
:root{{--demo-theme-page:#080b0e;--demo-theme-text:#edf0f2;--demo-theme-muted:#a5adb4;color-scheme:dark}}
:root[data-appearance="light"]{{--demo-theme-page:#f6f5f2;--demo-theme-text:#172026;--demo-theme-muted:#545e66;color-scheme:light}}
body{{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--demo-theme-page);color:var(--demo-theme-text);font:16px/1.6 system-ui,sans-serif}}main{{padding:32px;text-align:center}}h1{{font-size:24px;font-weight:500}}p{{color:var(--demo-theme-muted)}}
</style><main><h1>{title}</h1><p>{message}</p></main></html>"#
    );
    let response = format!("HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'\r\nConnection: close\r\n\r\n{body}", body.len());
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    let _ = stream.write_all(response.as_bytes());
}

#[tauri::command]
pub async fn start_auth_return(
    app: tauri::AppHandle,
    state: tauri::State<'_, AuthReturnServer>,
    nonce: String,
    appearance: String,
) -> Result<String, String> {
    if !valid_nonce(&nonce) {
        return Err("Invalid sign-in attempt".into());
    }
    let mut worker = state.0.lock().map_err(|_| "Sign-in unavailable")?;
    if let Some(previous) = worker.take() {
        previous.stop();
    }
    let listener = TcpListener::bind(ADDRESS).map_err(|_| "Sign-in return port is unavailable")?;
    listener
        .set_nonblocking(true)
        .map_err(|_| "Sign-in unavailable")?;
    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();
    let attempt = nonce.clone();
    let thread = thread::spawn(move || {
        let started = Instant::now();
        while !stop_thread.load(Ordering::Relaxed) && started.elapsed() < Duration::from_secs(600) {
            match listener.accept() {
                Ok((mut stream, peer)) if peer.ip().is_loopback() => {
                    let callback = read_headers(&mut stream, &stop_thread)
                        .and_then(|request| parse_request(&request, &attempt));
                    if stop_thread.load(Ordering::Relaxed) {
                        break;
                    }
                    let accepted = callback.as_ref().is_some_and(|url| {
                        app.emit_to("main", "deep-link://new-url", vec![url.clone()])
                            .is_ok()
                    });
                    respond(&mut stream, accepted, appearance == "light");
                    if accepted {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        break;
                    }
                }
                Ok(_) => (),
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(25))
                }
                Err(_) => break,
            }
        }
    });
    *worker = Some(Worker {
        nonce: nonce.clone(),
        stop,
        thread,
    });
    Ok(format!("{CALLBACK}?desktop_state={nonce}"))
}

#[tauri::command]
pub async fn stop_auth_return(
    state: tauri::State<'_, AuthReturnServer>,
    nonce: String,
) -> Result<(), String> {
    let mut worker = state.0.lock().map_err(|_| "Sign-in unavailable")?;
    if worker.as_ref().is_some_and(|active| active.nonce == nonce) {
        if let Some(active) = worker.take() {
            active.stop();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const NONCE: &str = "12345678-1234-4234-8234-123456789012";
    fn request(query: &str) -> String {
        format!(
            "GET /auth/callback?desktop_state={NONCE}{query} HTTP/1.1\r\nHost: {ADDRESS}\r\n\r\n"
        )
    }
    #[test]
    fn accepts_only_the_current_attempt() {
        let request = request("&code=12345678-1234-1234-1234-123456789012");
        assert!(parse_request(&request, NONCE)
            .unwrap()
            .starts_with("preacherman://auth/callback?code="));
        assert!(parse_request(&request, "different").is_none());
        assert!(valid_nonce(NONCE));
        assert!(!valid_nonce("anything"));
    }
    #[test]
    fn rejects_ambiguous_or_remote_requests() {
        for query in [
            "&code=short",
            "&code=1234567890123456&code=1234567890123457",
            "&desktop_state=other&code=1234567890123456",
            "&code=1234567890123456&sb_flow_id=bad!",
        ] {
            assert!(parse_request(&request(query), NONCE).is_none());
        }
        let valid = request("&code=1234567890123456");
        for invalid in [
            valid.replace(ADDRESS, "evil.test"),
            valid.replace("GET ", "POST "),
            valid.replace("/auth/callback?", "/other?"),
            valid.replace("Host:", "X-Host:"),
            valid.replace("\r\n\r\n", "\r\nContent-Length: 1\r\n\r\n"),
        ] {
            assert!(parse_request(&invalid, NONCE).is_none());
        }
    }
    #[test]
    fn no_code_is_a_safe_failure_not_a_session() {
        assert_eq!(
            parse_request(&request(""), NONCE).unwrap(),
            "preacherman://auth/callback?error=oauth_return_without_code"
        );
    }
}
