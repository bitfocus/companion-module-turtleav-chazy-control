## Turtle AV Chazy Control

Companion module for the Turtle AV Chazy Control and Chazy Control Pro.

### Config

- **Model** — Chazy Control or Chazy Control Pro. Some actions are only available on Pro.
- **Hostname** — IP address or hostname of the device.
- **Port** — HTTP port the device's web interface listens on.
- **Username** — must be an admin-level account.
- **Poll Interval (ms)** — how often the module polls the device for status.
- **Image Poll Interval (ms)** — how often Preview feedbacks refresh their captured image. Only runs while at least one Preview feedback is in use.

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
  - Use the **Device Preview** preset for a ready-made button — it wires the feedback's captured image straight onto the button via a local variable, with no extra style configuration needed.
