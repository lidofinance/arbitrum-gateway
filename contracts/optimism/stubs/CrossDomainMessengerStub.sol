// SPDX-FileCopyrightText: 2022 Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

import {ICrossDomainMessenger} from "../interfaces/ICrossDomainMessenger.sol";

/// @dev For testing purposes.
contract CrossDomainMessengerStub is ICrossDomainMessenger {
    address public xDomainMessageSender;
    uint256 public messageNonce;

    constructor() payable {}

    function setXDomainMessageSender(address value) external {
        xDomainMessageSender = value;
    }

    function sendMessage(
        address _target,
        bytes calldata _message,
        uint32 _gasLimit
    ) external {
        messageNonce += 1;
        emit SentMessage(
            _target,
            msg.sender,
            _message,
            messageNonce,
            _gasLimit
        );
    }

    function relayMessage(
        address _target,
        address, // sender
        bytes memory _message,
        uint256 // _messageNonce
    ) public {
        (bool success, ) = _target.call(_message);
        require(success, "CALL_FAILED");
    }

    event SentMessage(
        address indexed target,
        address sender,
        bytes message,
        uint256 messageNonce,
        uint256 gasLimit
    );
}
