// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  WaterTrust — "Machines measure, humans witness"
 * @author Aman Abraha Kasa (African Leadership University)
 * @notice Tamper-evident water-quality records for critical water infrastructure.
 *
 *         1. MACHINE LAYER  – Registered IoT sensors (e.g. a Raspberry Pi reading an
 *            RS485 probe) submit pH, turbidity and chlorine readings. Each reading is
 *            checked on-chain against the site's safety thresholds. An unsafe reading
 *            automatically opens an incident and emits a WaterAlert.
 *
 *         2. HUMAN LAYER    – Registered community witnesses (health workers, water
 *            committee members) perform independent spot checks and vote "safe" or
 *            "unsafe" on a reading using a COMMIT–REVEAL scheme, so nobody can copy
 *            or be pressured by another witness's vote.
 *
 *         3. CONSENSUS      – If the human majority disagrees with the sensor, the
 *            contract raises a TamperSuspected alert (sensor spoofed, hacked or
 *            faulty) and opens an incident that operators must handle on-chain.
 *
 *         4. ACCOUNTABILITY – Every incident must be acknowledged and then resolved
 *            by an operator, with a hash of the resolution report stored forever.
 *            Witnesses earn or lose reputation depending on whether they agree with
 *            the final consensus and whether they reveal their votes.
 *
 * @dev    Units are fixed-point integers (Solidity has no decimals):
 *           pH         x100  -> 7.20 pH     = 720
 *           turbidity  x100  -> 0.80 NTU    = 80
 *           chlorine   x100  -> 0.35 mg/L   = 35
 *         The contract never holds Ether, which removes re-entrancy and fund-theft risk.
 */
contract WaterTrust {
    // ─────────────────────────────────────────────────────────────────────────
    //  Types
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Why an incident was opened.
    enum IncidentKind {
        UnsafeReading, // sensor itself reported water outside safe thresholds
        SensorMismatch // human witnesses disagreed with the sensor -> possible tampering
    }

    /// @notice Lifecycle of an incident: Open -> Acknowledged -> Resolved.
    enum IncidentStatus {
        Open,
        Acknowledged,
        Resolved
    }

    /// @notice A witness verdict (None = not revealed / no consensus).
    enum Verdict {
        None,
        Safe,
        Unsafe
    }

    /// @notice A monitored water site (treatment plant, reservoir, borehole...).
    struct Site {
        string name;
        string location;
        bool active;
        uint16 phMin; // pH x100
        uint16 phMax; // pH x100
        uint32 turbidityMax; // NTU x100
        uint32 chlorineMin; // mg/L x100
        uint32 chlorineMax; // mg/L x100
    }

    /// @notice One sensor measurement stored on-chain.
    struct Reading {
        uint256 siteId;
        address sensor;
        uint16 ph;
        uint32 turbidity;
        uint32 chlorine;
        bytes32 dataHash; // keccak256 of the raw off-chain data batch (integrity anchor)
        uint64 timestamp;
        bool safe; // result of the on-chain threshold check
    }

    /// @notice An event that requires operator action.
    struct Incident {
        uint256 siteId;
        uint256 readingId;
        IncidentKind kind;
        IncidentStatus status;
        address handledBy; // operator who acknowledged / resolved it
        bytes32 noteHash; // hash of the resolution report kept off-chain
        uint64 openedAt;
        uint64 closedAt;
    }

    /// @notice A community witness and their track record.
    struct Witness {
        bool registered;
        bool active;
        int32 reputation;
        uint32 roundsJoined;
    }

    /// @notice A commit–reveal verification round on a specific reading.
    struct Round {
        uint256 readingId;
        uint64 commitDeadline; // commits allowed while block.timestamp <= commitDeadline
        uint64 revealDeadline; // reveals allowed after commitDeadline and <= revealDeadline
        uint32 quorum; // minimum reveals needed (snapshotted when the round opens)
        uint32 safeVotes;
        uint32 unsafeVotes;
        bool finalized;
        Verdict consensus;
        address[] committers;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────────

    uint16 public constant MAX_PH = 1400; // pH scale is 0–14
    uint64 public constant MIN_PHASE_DURATION = 30 seconds;
    uint64 public constant MAX_PHASE_DURATION = 7 days;
    /// @dev Caps the loop in finalizeRound so it can never run out of gas (DoS protection).
    uint256 public constant MAX_WITNESSES_PER_ROUND = 50;

    // ─────────────────────────────────────────────────────────────────────────
    //  Storage
    // ─────────────────────────────────────────────────────────────────────────

    address public admin; // regulator / utility authority
    address public pendingAdmin; // for safe two-step admin transfer
    uint32 public minQuorum; // default reveals needed for a valid round

    mapping(address => bool) public operators; // plant operators who handle incidents

    uint256 public siteCount;
    mapping(uint256 => Site) public sites; // siteId (starts at 1) => Site
    mapping(uint256 => uint256[]) private siteReadingIds; // siteId => reading ids
    mapping(uint256 => uint256) public latestReadingOf; // siteId => last reading id

    mapping(address => uint256) public sensorSite; // sensor => siteId (0 = not registered)
    mapping(address => bool) public sensorActive; // can be revoked if compromised

    uint256 public readingCount;
    mapping(uint256 => Reading) public readings; // readingId (starts at 1) => Reading

    uint256 public incidentCount;
    mapping(uint256 => Incident) public incidents; // incidentId (starts at 1) => Incident

    mapping(address => Witness) public witnesses;

    uint256 public roundCount;
    mapping(uint256 => Round) private rounds; // roundId (starts at 1) => Round
    mapping(uint256 => uint256) public roundOfReading; // readingId => roundId (0 = none)
    mapping(uint256 => mapping(address => bytes32)) private commitments;
    mapping(uint256 => mapping(address => Verdict)) public revealedVerdict;

    // ─────────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────────

    event AdminTransferStarted(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event OperatorUpdated(address indexed operator, bool allowed);
    event MinQuorumUpdated(uint32 newQuorum);

    event SiteAdded(uint256 indexed siteId, string name, string location);
    event ThresholdsUpdated(uint256 indexed siteId);
    event SiteStatusChanged(uint256 indexed siteId, bool active);

    event SensorRegistered(address indexed sensor, uint256 indexed siteId);
    event SensorStatusChanged(address indexed sensor, bool active);

    event WitnessRegistered(address indexed witness);
    event WitnessStatusChanged(address indexed witness, bool active);
    event ReputationChanged(address indexed witness, int32 newReputation);

    event ReadingSubmitted(
        uint256 indexed readingId,
        uint256 indexed siteId,
        address indexed sensor,
        bool safe,
        bytes32 dataHash
    );
    event WaterAlert(uint256 indexed incidentId, uint256 indexed siteId, uint256 readingId);

    event IncidentOpened(
        uint256 indexed incidentId,
        uint256 indexed siteId,
        uint256 readingId,
        IncidentKind kind
    );
    event IncidentAcknowledged(uint256 indexed incidentId, address indexed operator);
    event IncidentResolved(uint256 indexed incidentId, address indexed operator, bytes32 noteHash);

    event RoundOpened(
        uint256 indexed roundId,
        uint256 indexed readingId,
        uint64 commitDeadline,
        uint64 revealDeadline
    );
    event VerdictCommitted(uint256 indexed roundId, address indexed witness);
    event VerdictRevealed(uint256 indexed roundId, address indexed witness, bool safe);
    event RoundFinalized(
        uint256 indexed roundId,
        Verdict consensus,
        uint32 safeVotes,
        uint32 unsafeVotes
    );
    event TamperSuspected(uint256 indexed siteId, uint256 indexed readingId, uint256 roundId);

    // ─────────────────────────────────────────────────────────────────────────
    //  Errors (custom errors are cheaper than revert strings)
    // ─────────────────────────────────────────────────────────────────────────

    error NotAdmin();
    error NotPendingAdmin();
    error NotOperator();
    error NotActiveSensor();
    error NotActiveWitness();
    error InvalidInput();
    error SiteNotFound(uint256 siteId);
    error SiteInactive(uint256 siteId);
    error SensorAlreadyRegistered(address sensor);
    error SensorNotRegistered(address sensor);
    error WitnessAlreadyRegistered(address witness);
    error WitnessNotRegistered(address witness);
    error ReadingNotFound(uint256 readingId);
    error IncidentNotFound(uint256 incidentId);
    error InvalidIncidentState(IncidentStatus current);
    error RoundNotFound(uint256 roundId);
    error RoundAlreadyExists(uint256 readingId);
    error RoundFull();
    error CommitPhaseClosed();
    error RevealPhaseNotActive();
    error AlreadyCommitted();
    error NoCommitment();
    error AlreadyRevealed();
    error BadReveal();
    error RoundNotEnded();
    error RoundAlreadyFinalized();

    // ─────────────────────────────────────────────────────────────────────────
    //  Modifiers (role-based access control)
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyOperator() {
        if (!operators[msg.sender]) revert NotOperator();
        _;
    }

    modifier onlyActiveSensor() {
        if (sensorSite[msg.sender] == 0 || !sensorActive[msg.sender]) revert NotActiveSensor();
        _;
    }

    modifier onlyActiveWitness() {
        if (!witnesses[msg.sender].active) revert NotActiveWitness();
        _;
    }

    modifier siteExists(uint256 siteId) {
        if (siteId == 0 || siteId > siteCount) revert SiteNotFound(siteId);
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice The deployer becomes the admin and the first operator. Default quorum is 3.
    constructor() {
        admin = msg.sender;
        operators[msg.sender] = true;
        minQuorum = 3;
        emit AdminTransferred(address(0), msg.sender);
        emit OperatorUpdated(msg.sender, true);
        emit MinQuorumUpdated(3);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Admin: governance
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Step 1 of a two-step admin transfer (prevents handing control to a typo address).
    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert InvalidInput();
        pendingAdmin = newAdmin;
        emit AdminTransferStarted(admin, newAdmin);
    }

    /// @notice Step 2: the new admin must accept from their own address.
    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotPendingAdmin();
        emit AdminTransferred(admin, msg.sender);
        admin = msg.sender;
        pendingAdmin = address(0);
    }

    /// @notice Grant or revoke the operator role.
    function setOperator(address account, bool allowed) external onlyAdmin {
        if (account == address(0)) revert InvalidInput();
        operators[account] = allowed;
        emit OperatorUpdated(account, allowed);
    }

    /// @notice Change how many witness reveals a round needs to be conclusive (applies to new rounds).
    function setMinQuorum(uint32 newQuorum) external onlyAdmin {
        if (newQuorum == 0 || newQuorum > MAX_WITNESSES_PER_ROUND) revert InvalidInput();
        minQuorum = newQuorum;
        emit MinQuorumUpdated(newQuorum);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Admin: sites, sensors, witnesses
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Register a new monitored water site with its safety thresholds.
     * @dev    Typical WHO-based values: pH 650–850, turbidity <= 500 (5 NTU),
     *         chlorine residual 20–500 (0.2–5.0 mg/L).
     * @return siteId The id of the new site.
     */
    function addSite(
        string calldata name,
        string calldata location,
        uint16 phMin,
        uint16 phMax,
        uint32 turbidityMax,
        uint32 chlorineMin,
        uint32 chlorineMax
    ) external onlyAdmin returns (uint256 siteId) {
        if (bytes(name).length == 0) revert InvalidInput();
        _validateThresholds(phMin, phMax, chlorineMin, chlorineMax);

        siteId = ++siteCount;
        // Field-by-field assignment keeps the EVM stack shallow (no "stack too deep").
        Site storage s = sites[siteId];
        s.name = name;
        s.location = location;
        s.active = true;
        s.phMin = phMin;
        s.phMax = phMax;
        s.turbidityMax = turbidityMax;
        s.chlorineMin = chlorineMin;
        s.chlorineMax = chlorineMax;
        emit SiteAdded(siteId, name, location);
    }

    /// @notice Update a site's safety thresholds (e.g. after new regulations).
    function updateThresholds(
        uint256 siteId,
        uint16 phMin,
        uint16 phMax,
        uint32 turbidityMax,
        uint32 chlorineMin,
        uint32 chlorineMax
    ) external onlyAdmin siteExists(siteId) {
        _validateThresholds(phMin, phMax, chlorineMin, chlorineMax);
        Site storage s = sites[siteId];
        s.phMin = phMin;
        s.phMax = phMax;
        s.turbidityMax = turbidityMax;
        s.chlorineMin = chlorineMin;
        s.chlorineMax = chlorineMax;
        emit ThresholdsUpdated(siteId);
    }

    /// @notice Take a site offline (maintenance / decommissioned) or back online.
    function setSiteActive(uint256 siteId, bool active) external onlyAdmin siteExists(siteId) {
        sites[siteId].active = active;
        emit SiteStatusChanged(siteId, active);
    }

    /// @notice Bind a sensor device address to one site. A sensor can only ever belong to one site.
    function registerSensor(address sensor, uint256 siteId) external onlyAdmin siteExists(siteId) {
        if (sensor == address(0)) revert InvalidInput();
        if (sensorSite[sensor] != 0) revert SensorAlreadyRegistered(sensor);
        sensorSite[sensor] = siteId;
        sensorActive[sensor] = true;
        emit SensorRegistered(sensor, siteId);
    }

    /// @notice Revoke (or restore) a sensor, e.g. when its key is suspected to be compromised.
    function setSensorActive(address sensor, bool active) external onlyAdmin {
        if (sensorSite[sensor] == 0) revert SensorNotRegistered(sensor);
        sensorActive[sensor] = active;
        emit SensorStatusChanged(sensor, active);
    }

    /// @notice Register a community witness.
    function registerWitness(address account) external onlyAdmin {
        if (account == address(0)) revert InvalidInput();
        if (witnesses[account].registered) revert WitnessAlreadyRegistered(account);
        witnesses[account].registered = true;
        witnesses[account].active = true;
        emit WitnessRegistered(account);
    }

    /// @notice Suspend or restore a witness (e.g. repeated dishonest votes).
    function setWitnessActive(address account, bool active) external onlyAdmin {
        if (!witnesses[account].registered) revert WitnessNotRegistered(account);
        witnesses[account].active = active;
        emit WitnessStatusChanged(account, active);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Machine layer: sensor readings
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Called by a registered sensor to record a measurement.
     * @param  ph        pH x100 (0–1400)
     * @param  turbidity NTU x100
     * @param  chlorine  mg/L x100
     * @param  dataHash  keccak256 of the raw data batch stored off-chain, so anyone can
     *                   later prove the off-chain logs were not edited.
     * @return readingId The id of the stored reading.
     */
    function submitReading(
        uint16 ph,
        uint32 turbidity,
        uint32 chlorine,
        bytes32 dataHash
    ) external onlyActiveSensor returns (uint256 readingId) {
        if (ph > MAX_PH || dataHash == bytes32(0)) revert InvalidInput();

        uint256 siteId = sensorSite[msg.sender];
        Site storage s = sites[siteId];
        if (!s.active) revert SiteInactive(siteId);

        bool safe = _isSafe(s, ph, turbidity, chlorine);

        readingId = ++readingCount;
        Reading storage rd = readings[readingId];
        rd.siteId = siteId;
        rd.sensor = msg.sender;
        rd.ph = ph;
        rd.turbidity = turbidity;
        rd.chlorine = chlorine;
        rd.dataHash = dataHash;
        rd.timestamp = uint64(block.timestamp);
        rd.safe = safe;
        siteReadingIds[siteId].push(readingId);
        latestReadingOf[siteId] = readingId;

        emit ReadingSubmitted(readingId, siteId, msg.sender, safe, dataHash);

        // Automatic alert: unsafe water opens an incident immediately.
        if (!safe) {
            uint256 incidentId = _openIncident(siteId, readingId, IncidentKind.UnsafeReading);
            emit WaterAlert(incidentId, siteId, readingId);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Accountability: incident handling by operators
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Operator confirms they have seen the incident and are acting on it.
    function acknowledgeIncident(uint256 incidentId) external onlyOperator {
        Incident storage inc = _getIncident(incidentId);
        if (inc.status != IncidentStatus.Open) revert InvalidIncidentState(inc.status);
        inc.status = IncidentStatus.Acknowledged;
        inc.handledBy = msg.sender;
        emit IncidentAcknowledged(incidentId, msg.sender);
    }

    /**
     * @notice Operator closes an acknowledged incident.
     * @param  noteHash keccak256 of the resolution report (lab results, repair notes...).
     *         The full report stays off-chain; the hash proves it was never altered.
     */
    function resolveIncident(uint256 incidentId, bytes32 noteHash) external onlyOperator {
        if (noteHash == bytes32(0)) revert InvalidInput();
        Incident storage inc = _getIncident(incidentId);
        if (inc.status != IncidentStatus.Acknowledged) revert InvalidIncidentState(inc.status);
        inc.status = IncidentStatus.Resolved;
        inc.handledBy = msg.sender;
        inc.noteHash = noteHash;
        inc.closedAt = uint64(block.timestamp);
        emit IncidentResolved(incidentId, msg.sender, noteHash);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Human layer: commit–reveal verification rounds
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Operator asks community witnesses to independently verify a reading.
     * @param  commitDuration seconds during which witnesses submit hidden votes
     * @param  revealDuration seconds during which witnesses reveal their votes
     */
    function openVerificationRound(
        uint256 readingId,
        uint64 commitDuration,
        uint64 revealDuration
    ) external onlyOperator returns (uint256 roundId) {
        if (readingId == 0 || readingId > readingCount) revert ReadingNotFound(readingId);
        if (roundOfReading[readingId] != 0) revert RoundAlreadyExists(readingId);
        if (
            commitDuration < MIN_PHASE_DURATION ||
            commitDuration > MAX_PHASE_DURATION ||
            revealDuration < MIN_PHASE_DURATION ||
            revealDuration > MAX_PHASE_DURATION
        ) revert InvalidInput();

        roundId = ++roundCount;
        Round storage r = rounds[roundId];
        r.readingId = readingId;
        r.commitDeadline = uint64(block.timestamp) + commitDuration;
        r.revealDeadline = r.commitDeadline + revealDuration;
        r.quorum = minQuorum;
        roundOfReading[readingId] = roundId;

        emit RoundOpened(roundId, readingId, r.commitDeadline, r.revealDeadline);
    }

    /**
     * @notice Phase 1 — a witness submits a HIDDEN vote.
     * @param  commitment keccak256(abi.encodePacked(roundId, witnessAddress, safe, salt))
     *         Including roundId and the witness address stops anyone from copying
     *         another witness's commitment or replaying it in a different round.
     */
    function commitVerdict(uint256 roundId, bytes32 commitment) external onlyActiveWitness {
        Round storage r = _getRound(roundId);
        if (block.timestamp > r.commitDeadline) revert CommitPhaseClosed();
        if (commitment == bytes32(0)) revert InvalidInput();
        if (commitments[roundId][msg.sender] != bytes32(0)) revert AlreadyCommitted();
        if (r.committers.length >= MAX_WITNESSES_PER_ROUND) revert RoundFull();

        commitments[roundId][msg.sender] = commitment;
        r.committers.push(msg.sender);
        witnesses[msg.sender].roundsJoined += 1;

        emit VerdictCommitted(roundId, msg.sender);
    }

    /**
     * @notice Phase 2 — the witness reveals the vote and the secret salt.
     *         The contract recomputes the hash; it must match the earlier commitment.
     */
    function revealVerdict(uint256 roundId, bool safe, bytes32 salt) external {
        Round storage r = _getRound(roundId);
        if (block.timestamp <= r.commitDeadline || block.timestamp > r.revealDeadline) {
            revert RevealPhaseNotActive();
        }
        bytes32 stored = commitments[roundId][msg.sender];
        if (stored == bytes32(0)) revert NoCommitment();
        if (revealedVerdict[roundId][msg.sender] != Verdict.None) revert AlreadyRevealed();
        if (computeCommitment(roundId, msg.sender, safe, salt) != stored) revert BadReveal();

        if (safe) {
            revealedVerdict[roundId][msg.sender] = Verdict.Safe;
            r.safeVotes += 1;
        } else {
            revealedVerdict[roundId][msg.sender] = Verdict.Unsafe;
            r.unsafeVotes += 1;
        }
        emit VerdictRevealed(roundId, msg.sender, safe);
    }

    /**
     * @notice After the reveal phase anyone can finalize the round.
     *         - Majority of revealed votes = consensus (a tie or too few reveals = no consensus).
     *         - Witnesses who match consensus gain +1 reputation, others lose 1.
     *         - Witnesses who committed but never revealed lose 1 (stops "commit and hide").
     *         - If consensus disagrees with the sensor -> TamperSuspected + incident.
     */
    function finalizeRound(uint256 roundId) external {
        Round storage r = _getRound(roundId);
        if (r.finalized) revert RoundAlreadyFinalized();
        if (block.timestamp <= r.revealDeadline) revert RoundNotEnded();

        r.finalized = true; // effects before any further logic

        Verdict consensus = Verdict.None;
        if (r.safeVotes + r.unsafeVotes >= r.quorum) {
            if (r.safeVotes > r.unsafeVotes) consensus = Verdict.Safe;
            else if (r.unsafeVotes > r.safeVotes) consensus = Verdict.Unsafe;
        }
        r.consensus = consensus;

        // Update reputation (bounded loop: at most MAX_WITNESSES_PER_ROUND iterations).
        uint256 n = r.committers.length;
        for (uint256 i = 0; i < n; ++i) {
            address w = r.committers[i];
            Verdict v = revealedVerdict[roundId][w];
            if (v == Verdict.None) {
                _changeReputation(w, -1); // committed but did not reveal
            } else if (consensus != Verdict.None) {
                _changeReputation(w, v == consensus ? int32(1) : int32(-1));
            }
        }

        emit RoundFinalized(roundId, consensus, r.safeVotes, r.unsafeVotes);

        // Humans vs machine: a disagreement means the sensor cannot be trusted.
        Reading storage rd = readings[r.readingId];
        if (consensus != Verdict.None && (consensus == Verdict.Safe) != rd.safe) {
            _openIncident(rd.siteId, r.readingId, IncidentKind.SensorMismatch);
            emit TamperSuspected(rd.siteId, r.readingId, roundId);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Views / helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Helper to build a commitment hash (handy in Remix).
     * @dev    Calling this through a public RPC sends your salt to that node. In
     *         production, witnesses should compute the hash locally in their wallet app.
     */
    function computeCommitment(
        uint256 roundId,
        address witness,
        bool safe,
        bytes32 salt
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(roundId, witness, safe, salt));
    }

    /// @notice Summary of a verification round.
    function getRound(
        uint256 roundId
    )
        external
        view
        returns (
            uint256 readingId,
            uint64 commitDeadline,
            uint64 revealDeadline,
            uint32 quorum,
            uint32 safeVotes,
            uint32 unsafeVotes,
            bool finalized,
            Verdict consensus,
            uint256 committerCount
        )
    {
        Round storage r = _getRound(roundId);
        readingId = r.readingId;
        commitDeadline = r.commitDeadline;
        revealDeadline = r.revealDeadline;
        quorum = r.quorum;
        safeVotes = r.safeVotes;
        unsafeVotes = r.unsafeVotes;
        finalized = r.finalized;
        consensus = r.consensus;
        committerCount = r.committers.length;
    }

    /// @notice All reading ids recorded for a site (full audit history).
    function getSiteReadingIds(
        uint256 siteId
    ) external view siteExists(siteId) returns (uint256[] memory) {
        return siteReadingIds[siteId];
    }

    /// @notice Whether a witness has committed in a round (the hash itself stays private-ish).
    function hasCommitted(uint256 roundId, address witness) external view returns (bool) {
        return commitments[roundId][witness] != bytes32(0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Internal logic
    // ─────────────────────────────────────────────────────────────────────────

    function _validateThresholds(
        uint16 phMin,
        uint16 phMax,
        uint32 chlorineMin,
        uint32 chlorineMax
    ) internal pure {
        if (phMin >= phMax || phMax > MAX_PH || chlorineMin > chlorineMax) revert InvalidInput();
    }

    /// @dev Core safety rule: every parameter must be inside the site's limits.
    function _isSafe(
        Site storage s,
        uint16 ph,
        uint32 turbidity,
        uint32 chlorine
    ) internal view returns (bool) {
        return
            ph >= s.phMin &&
            ph <= s.phMax &&
            turbidity <= s.turbidityMax &&
            chlorine >= s.chlorineMin &&
            chlorine <= s.chlorineMax;
    }

    function _openIncident(
        uint256 siteId,
        uint256 readingId,
        IncidentKind kind
    ) internal returns (uint256 incidentId) {
        incidentId = ++incidentCount;
        Incident storage inc = incidents[incidentId];
        inc.siteId = siteId;
        inc.readingId = readingId;
        inc.kind = kind;
        inc.status = IncidentStatus.Open; // explicit for readability (Open is the default)
        inc.openedAt = uint64(block.timestamp);
        emit IncidentOpened(incidentId, siteId, readingId, kind);
    }

    function _changeReputation(address w, int32 delta) internal {
        int32 newRep = witnesses[w].reputation + delta;
        witnesses[w].reputation = newRep;
        emit ReputationChanged(w, newRep);
    }

    function _getIncident(uint256 incidentId) internal view returns (Incident storage) {
        if (incidentId == 0 || incidentId > incidentCount) revert IncidentNotFound(incidentId);
        return incidents[incidentId];
    }

    function _getRound(uint256 roundId) internal view returns (Round storage) {
        if (roundId == 0 || roundId > roundCount) revert RoundNotFound(roundId);
        return rounds[roundId];
    }
}
