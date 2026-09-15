describe("extension update monitor", () => {
  afterEach(() => {
    jest.resetModules();
    delete global.chrome;
  });

  test("stores pending updates and clears them after installation", () => {
    let updateListener;
    let installedListener;
    const set = jest.fn();
    const remove = jest.fn();
    global.chrome = {
      runtime: {
        onUpdateAvailable: {
          addListener: (listener) => {
            updateListener = listener;
          },
        },
        onInstalled: {
          addListener: (listener) => {
            installedListener = listener;
          },
        },
      },
      storage: {
        local: { set, remove },
      },
    };

    require("../../update-monitor.js");
    updateListener({ version: "2.0.31" });
    installedListener();

    expect(set).toHaveBeenCalledWith({
      uglyPadletUpdateAvailable: { version: "2.0.31" },
    });
    expect(remove).toHaveBeenCalledWith("uglyPadletUpdateAvailable");
  });
});
