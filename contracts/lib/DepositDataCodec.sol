// SPDX-FileCopyrightText: 2024 Lido <info@lido.fi>
// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.10;

/// @author kovalgek
/// @notice encodes and decodes DepositData for crosschain transfering.
library DepositDataCodec {

    uint8 internal constant RATE_FIELD_SIZE = 12;
    uint8 internal constant TIMESTAMP_FIELD_SIZE = 5;

    struct DepositData {
        uint96 rate;
        uint40 timestamp;
        bytes data;
    }

    function encodeDepositData(DepositData memory depositData) internal pure returns (bytes memory) {
        bytes memory data = bytes.concat(
            abi.encodePacked(depositData.rate),
            abi.encodePacked(depositData.timestamp),
            abi.encodePacked(depositData.data)
        );
        return data;
    }

    function decodeDepositData(bytes calldata buffer) internal pure returns (DepositData memory) {

        if (buffer.length < RATE_FIELD_SIZE + TIMESTAMP_FIELD_SIZE) {
            revert ErrorDepositDataLength();
        }

        DepositData memory depositData = DepositData({
            rate: uint96(bytes12(buffer[0:RATE_FIELD_SIZE])),
            timestamp: uint40(bytes5(buffer[RATE_FIELD_SIZE:RATE_FIELD_SIZE + TIMESTAMP_FIELD_SIZE])),
            data: buffer[RATE_FIELD_SIZE + TIMESTAMP_FIELD_SIZE:]
        });

        return depositData;
    }

    error ErrorDepositDataLength();
}
