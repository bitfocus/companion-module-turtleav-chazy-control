## Turtle AV Chazy Control

Companion module for the Turtle AV Chazy Control and Chazy Control Pro.

### Config

- **Model** — Chazy Control or Chazy Control Pro. Some actions are only available on Pro.
- **Hostname** — IP address or hostname of the device.
- **Protocol** — HTTP or HTTPS.
- **Allow Insecure Connections** — Accepts self-signed or otherwise untrusted TLS certificates.
- **Username** — must be an admin-level account.
- **Poll Interval (ms)** — how often the module polls the device for status.
- **Image Poll Interval (ms)** — how often Preview feedbacks refresh their captured image. Only runs while at least one Preview feedback is in use.
- **Connection Variables** — which sets of variables to keep for the devices the controller reports (see Variables below).

### Variables

Each set is created only when selected in **Connection Variables** in the config. Nothing is selected by default, and all of them are refreshed every poll interval.

| Set                     | Variables                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| **Encoders**            | `encoder_<id>` — the full status object for that encoder                                  |
| **Decoders**            | `decoder_<id>` — the full status object for that decoder                                  |
| **Dante Devices**       | `dante_<name>` — the full status object for that Dante device                             |
| **Dante Subscriptions** | `dante_<name>_rx<n>_source` and `dante_<name>_rx<n>_status`, one pair per receive channel |

A subscription's `_source` is the transmitter it is subscribed to, as `<device>:<channel>`, and is empty when the channel is not subscribed — so a feedback can test for unsubscribed with `$(…:dante_<name>_rx1_source) == ''`. The `_status` is the device's own word for the state, such as `SUBSCRIBE_SELF` or `NONE`.

Encoders and decoders are keyed by their numeric device id, so the variable name stays stable if the device is renamed. Dante devices are keyed by name, since that is how the device API addresses them — renaming one renames its variables, and any button referencing them needs updating.

### Actions

**Device Management**

- Search Encoders/Decoders
- Get Search Status
- Reset Search
- Add Encoder Device
- Add Decoder Device
- Reset Added Devices
- Add All Found Devices Automatically

**Decoder**

- Switch — route an encoder's Video/Audio/IR/RS232/USB/CEC/Media (or All) signal to a decoder. Encoder 0 sends "All" to no source, or returns a single signal type to follow mode.
- USB Data — enable or disable a decoder's USB camera.

**Dante**

- Device Name
- Sample Rate
- Encoding
- TX Channel Name
- Add Transmit Flow
- Delete Transmit Flow
- RX Channel Name
- Subscription
- Subscription (by name)
- Latency
- Get Device Status
- Search Devices
- Preferred _(Pro only)_
- AES67 _(Pro only)_
- AES67 Prefix _(Pro only)_
- Clear Configuration _(Pro only)_
- Static IP _(Pro only)_
- Dynamic IP (DHCP) _(Pro only)_
- Reboot Device _(Pro only)_
- Clear Events _(Pro only)_

**Dante Preset** _(Pro only)_

- Create
- Delete
- Name
- Apply
- Get Status

**Event** _(Pro only)_

- Create
- Delete
- Name
- Type
- Address
- Address With Port
- Data (ASCII)
- Data (HEX)
- Params
- Request
- Resend Delay
- Start
- Stop
- Get Status

### Feedback

- **Preview** — captures a still image from a device on the network and returns it as a value, so it can be shown on a button. Set the `Device` option to the IP address of the device to preview.
  - The **Encoders**/**Decoders** presets give a ready-made button per discovered device, already pointed at that device's IP — each binds the feedback to a local variable and feeds it into the **Device Preview** element below, with no extra style configuration needed.

### Graphics Elements

- **Device Preview** — an image element for layered buttons. Set its `Image` option to a captured image, e.g. `$(local:preview_image)` bound to the Preview feedback, and choose how it fills the button (`Fit` by default). The element only draws the image; the Preview feedback is what captures it and keeps it refreshed.
