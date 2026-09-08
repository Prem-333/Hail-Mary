# Doc 2 — Hardware Physics & Burn-In Context
### Person 2 Preparation Sheet | SIH 2026 · LATENT

> **Your job in the presentation:** Prove that our data is physically real, our
> parameters were chosen for engineering reasons, and our system sits correctly
> within the ISRO semiconductor testing workflow.

---

## 1. What Is Burn-In Testing?

Burn-in testing is an **accelerated aging** process used to weed out weak
semiconductor components before they are installed in critical systems like
satellites.

**The Concept — Infant Mortality:**
Semiconductors fail in a "bathtub curve":
- **Early life (Infant Mortality):** Weak components fail very quickly due to
  manufacturing defects.
- **Useful life:** Healthy components operate reliably for years.
- **Wear-out:** All components eventually degrade.

Burn-in forces components through the infant mortality phase in a controlled lab
environment. A component that survives burn-in is far more likely to survive in
orbit.

**Our Burn-In Conditions:**
- **Temperature:** 125°C (thermal stress accelerates degradation by ~50× compared
  to room temperature).
- **Duration:** 168 hours (7 days).
- **Measurement Timepoints:** 0h, 24h, 96h, 168h.

---

## 2. Why These Two Parameters?

We monitor exactly two electrical parameters for each component. These two were
chosen because they are the earliest measurable indicators of the failure
mechanisms most common in space-grade CMOS silicon.

### Leakage Current (I_leak) — measured in microamps (µA)

Leakage current is the small but unwanted electrical current that "leaks" through
a transistor even when it is switched OFF. In a healthy transistor, this should
be near zero and increase very slowly over time.

**Normal range in our lots:** 12 – 22 µA baseline  
**Datasheet limit (maximum allowed):** 50 µA  
**What a high or rising leakage means:** The gate oxide (the insulating layer
in the transistor) is degrading. This is caused by a failure mechanism called
**Hot Carrier Injection (HCI)** — high-energy electrons that punch through the
oxide and permanently damage it.

### Propagation Delay (t_pd) — measured in nanoseconds (ns)

Propagation delay is the time it takes for an electrical signal to travel through
a logic gate. In a healthy chip, this should be small and stable.

**Normal range in our lots:** 6 – 11 ns baseline  
**Datasheet limit (maximum allowed):** 18 ns  
**What increasing delay means:** Transistors are slowing down. This can be caused
by oxide charge trapping or electromigration in the metal interconnects.

---

## 3. The Arrhenius Equation — Physics of Degradation

This is the physical equation we used to generate our synthetic dataset. It is a
well-established equation used by Intel, TSMC, and every major semiconductor
manufacturer.

$$\text{rate} \propto \exp\left(\frac{-E_a}{k_B T}\right)$$

Where:
- $E_a$ = Activation Energy (eV) — the "energy barrier" a failure mechanism
  needs to overcome
- $k_B$ = Boltzmann's Constant = 8.617 × 10⁻⁵ eV/K
- $T$ = Temperature in Kelvin

**In our model:** Component value degrades as:
$$V(t) = V_0 \times e^{\alpha \cdot t}$$

Where $\alpha$ (the drift rate) is derived from the Arrhenius equation.

### Validation Numbers

Running `python validate_physics.py` confirms:

| Parameter | Value |
|-----------|-------|
| Activation Energy ($E_a$) | 0.4 eV (HCI failure mode) |
| Stress Temperature | 125°C = 398.15 K |
| Nominal Temperature | 25°C = 298.15 K |
| **Acceleration Factor** | **~50×** |

This means 168 hours of burn-in at 125°C is equivalent to ~8,400 hours (~1 year)
of field operation at 25°C. This is consistent with published MIL-HDBK-217 data.

---

## 4. The Three Component Types

Our dataset contains three classes of components. You must know all three.

### Normal Component
- Baseline follows the lot distribution (lot mean 12–22 µA)
- Drift rate: α = 0.0003 – 0.0008 /h
- Worst-case at 168h: ~24 µA — still well under the 50 µA limit
- **System decision: ACCEPT**

### Obvious Defect
- Baseline is severely wrong from the start (4–5× the lot mean — e.g., 88 µA baseline)
- These immediately exceed the 50 µA static datasheet limit
- **Caught by both traditional limits AND our Module A (Z-score ≫ 3.5)**
- **System decision: REJECT**

### Latent Defect (the most important class)
- Starts with a **perfectly normal baseline** — indistinguishable from good parts
- Behaves normally for the first ~40 hours (the "knee" point)
- After the knee, accelerated drift kicks in (α_accel = 0.007 /h — ~9× faster)
- At 168h: can reach 38–40 µA — still under the 50 µA limit!
- **Traditional testing PASSES this component**
- **Our Module A catches it** via the MAD Z-score and Isolation Forest

---

## 5. MIL-PRF-38535 Class S Standards

This is the military and space-grade semiconductor standard that governs ISRO
component procurement.

Key requirements relevant to our system:
- Maximum defect escape rate: **< 1%**
- Burn-in is **mandatory** for Class S components
- QA sign-off documentation is required for every lot

Our system's recall of **96.24%** means our defect escape rate is approximately
**3.76%** — we are transparent that this is above the MIL-PRF-38535 1% target
for the latent class specifically, but our system dramatically outperforms
static-limit screening on this hardest class.

---

## 6. Soundbites for Judges

- *"We chose Leakage Current and Propagation Delay specifically because they are
  the first measurable signatures of Hot Carrier Injection, the dominant failure
  mechanism in CMOS components under thermal stress."*
- *"Our synthetic dataset is not randomly generated — each trajectory follows the
  Arrhenius equation with physically validated activation energies of 0.3–0.5 eV,
  matching published CMOS HCI data. We validated all parameters in validate_physics.py."*
- *"168 hours at 125°C is not arbitrary — the Arrhenius acceleration factor of
  ~50× means this test compresses approximately one year of field operation into
  one week."*
