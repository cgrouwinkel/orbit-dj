// ORBIT DJ - Scriptable launcher
// Runs on your personal iPhone. No account or setup required.
const URL = "https://cgrouwinkel.github.io/orbit-dj/";

const menu = new Alert();
menu.title = "ORBIT DJ";
menu.message = "Choose how to launch your DJ arcade.";
menu.addAction("Play in Safari (recommended)");
menu.addAction("Play inside Scriptable");
menu.addAction("Check website");
menu.addCancelAction("Cancel");
const choice = await menu.presentAlert();

if (choice === 0) {
  Safari.open(URL);
} else if (choice === 1) {
  try {
    const view = new WebView();
    await view.loadURL(URL);
    await view.present(true);
  } catch (e) {
    const error = new Alert();
    error.title = "Could not open ORBIT";
    error.message = String(e);
    error.addAction("Open Safari");
    error.addCancelAction("Close");
    if (await error.presentAlert() === 0) Safari.open(URL);
  }
} else if (choice === 2) {
  const report = new Alert();
  try {
    const request = new Request(URL);
    request.timeoutInterval = 12;
    const html = await request.loadString();
    const status = request.response?.statusCode || 0;
    if (status < 200 || status >= 400 || !/<html[\\s>]/i.test(html)) {
      throw new Error("Unexpected website response (HTTP " + status + ")");
    }
    report.title = "Website reachable";
    report.message = "ORBIT responded. Audio and gameplay must be tested separately.";
  } catch (e) {
    report.title = "Connection problem";
    report.message = String(e);
  }
  report.addAction("OK");
  await report.presentAlert();
}
Script.complete();
