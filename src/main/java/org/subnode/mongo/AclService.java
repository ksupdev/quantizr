package org.subnode.mongo;

import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Set;
import java.util.StringTokenizer;

import org.subnode.config.NodePrincipal;
import org.subnode.model.client.NodeProp;
import org.subnode.mongo.model.AccessControl;
import org.subnode.mongo.model.MongoPrincipal;
import org.subnode.mongo.model.SubNode;
import org.subnode.request.AddPrivilegeRequest;
import org.subnode.request.GetNodePrivilegesRequest;
import org.subnode.request.RemovePrivilegeRequest;
import org.subnode.request.SetCipherKeyRequest;
import org.subnode.response.AddPrivilegeResponse;
import org.subnode.response.GetNodePrivilegesResponse;
import org.subnode.response.RemovePrivilegeResponse;
import org.subnode.response.SetCipherKeyResponse;
import org.subnode.service.UserManagerService;
import org.subnode.util.ExUtil;
import org.subnode.util.ThreadLocals;
import org.subnode.util.XString;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Service methods for (ACL): processing security, privileges, and Access
 * Control List information on nodes.
 */
@Component
public class AclService {
	private static final Logger log = LoggerFactory.getLogger(AclService.class);

	@Autowired
	private MongoApi api;

	@Autowired
	private UserManagerService userManagerService;

	/**
	 * Returns the privileges that exist on the node identified in the request.
	 */
	public void getNodePrivileges(MongoSession session, GetNodePrivilegesRequest req, GetNodePrivilegesResponse res) {
		if (session == null) {
			session = ThreadLocals.getMongoSession();
		}

		String nodeId = req.getNodeId();
		SubNode node = api.getNode(session, nodeId);

		if (!req.isIncludeAcl() && !req.isIncludeOwners()) {
			throw ExUtil.newEx("no specific information requested for getNodePrivileges");
		}

		if (req.isIncludeAcl()) {
			res.setAclEntries(api.getAclEntries(session, node));
		}

		if (req.isIncludeOwners()) {
			List<String> owners = userManagerService.getOwnerNames(node);
			// log.info("Owner Count: " + owners.size());
			res.setOwners(owners);
		}

		res.setSuccess(true);
	}

	/*
	 * Adds or updates a new privilege to a node
	 */
	public void addPrivilege(MongoSession session, AddPrivilegeRequest req, AddPrivilegeResponse res) {
		if (session == null) {
			session = ThreadLocals.getMongoSession();
		}

		String nodeId = req.getNodeId();
		SubNode node = api.getNode(session, nodeId);
		api.authRequireOwnerOfNode(session, node);

		boolean success = addPrivilege(session, node, req.getPrincipal(), req.getPrivileges(), res);
		res.setSuccess(success);
	}

	/*
	 * Adds or updates a new privilege to a node
	 */
	public void setCipherKey(MongoSession session, SetCipherKeyRequest req, SetCipherKeyResponse res) {
		if (session == null) {
			session = ThreadLocals.getMongoSession();
		}

		String nodeId = req.getNodeId();
		SubNode node = api.getNode(session, nodeId);
		api.authRequireOwnerOfNode(session, node);

		String cipherKey = node.getStringProp(NodeProp.ENC_KEY.toString());
		if (cipherKey == null) {
			throw new RuntimeException("Attempted to alter keys on a non-encrypted node.");
		}

		boolean success = setCipherKey(session, node, req.getPrincipalNodeId(), req.getCipherKey(), res);
		res.setSuccess(success);
	}

	public boolean setCipherKey(MongoSession session, SubNode node, String principalNodeId, String cipherKey,
			SetCipherKeyResponse res) {
		boolean ret = false;

		HashMap<String, AccessControl> acl = node.getAc();
		AccessControl ac = acl.get(principalNodeId);
		if (ac != null) {
			ac.setKey(cipherKey);
			node.setAc(acl);
			api.save(session, node);
			ret = true;
		}
		return ret;
	}

	public boolean addPrivilege(MongoSession session, SubNode node, String principal, List<String> privileges,
			AddPrivilegeResponse res) {

		if (principal == null)
			return false;

		String cipherKey = node.getStringProp(NodeProp.ENC_KEY.toString());
		String mapKey = null;

		/* If we are sharing to public, then that's the map key */
		if (principal.equalsIgnoreCase(NodePrincipal.PUBLIC)) {
			if (cipherKey != null) {
				throw new RuntimeException("Cannot make an encrypted node public.");
			}
			mapKey = NodePrincipal.PUBLIC;
		}
		/*
		 * otherwise we're sharing to a person so we now get their userNodeId to use as
		 * map key
		 */
		else {
			SubNode principalNode = api.getUserNodeByUserName(api.getAdminSession(), principal);
			if (principalNode == null) {
				if (res != null) {
					res.setMessage("Unknown user name: " + principal);
					res.setSuccess(false);
				}
				return false;
			}
			mapKey = principalNode.getId().toHexString();

			/*
			 * If this node is encrypted we get the public key of the user being shared with
			 * to send back to the client, which will then use it to encrypt the symmetric
			 * key to the data, and then send back up to the server to store in this sharing
			 * entry
			 */
			if (cipherKey != null) {
				String principalPubKey = principalNode.getStringProp(NodeProp.USER_PREF_PUBLIC_KEY.toString());
				if (principalPubKey == null) {
					if (res != null) {
						res.setMessage("User doesn't have a PublicKey available: " + principal);
						res.setSuccess(false);
						return false;
					}
				}
				log.debug("principalPublicKey: "+principalPubKey);
				res.setPrincipalPublicKey(principalPubKey);
				res.setPrincipalNodeId(mapKey);
			}

			/*
			 * todo-1: send not just notification email, but send to people's INBOX node
			 * also. will require us to invent the INBOX for user. Doesn't yet exist.
			 */
		}

		/* initialize acl to a map if it's null */
		HashMap<String, AccessControl> acl = node.getAc();
		if (acl == null) {
			acl = new HashMap<String, AccessControl>();
		}

		/*
		 * Get access control entry from map, but if one is not found, we can just
		 * create one.
		 */
		AccessControl ac = acl.get(mapKey);
		if (ac == null) {
			ac = new AccessControl();
		}

		String prvs = ac.getPrvs();
		if (prvs == null) {
			prvs = "";
		}

		boolean authAdded = false;
		for (String priv : privileges) {
			if (prvs.indexOf(priv) == -1) {
				authAdded = true;
				if (prvs.length() > 0) {
					prvs += ",";
				}
				prvs += priv;
			}
		}

		if (authAdded) {
			ac.setPrvs(prvs);
			acl.put(mapKey, ac);
			node.setAc(acl);
			api.save(session, node);
		}

		return true;
	}

	public void removeAclEntry(MongoSession session, SubNode node, String principalNodeId, String privToRemove) {
		HashSet<String> setToRemove = XString.tokenizeToSet(privToRemove, ",", true);

		HashMap<String, AccessControl> acl = node.getAc();
		if (acl == null)
			return;

		AccessControl ac = acl.get(principalNodeId);
		String privs = ac.getPrvs();
		if (privs == null) {
			log.debug("ACL didn't contain principalNodeId " + principalNodeId + "\nACL DUMP: "
					+ XString.prettyPrint(acl));
			return;
		}
		StringTokenizer t = new StringTokenizer(privs, ",", false);
		String newPrivs = "";
		boolean removed = false;

		/*
		 * build the new comma-delimited privs list by adding all that aren't in the
		 * 'setToRemove
		 */
		while (t.hasMoreTokens()) {
			String tok = t.nextToken().trim();
			if (setToRemove.contains(tok)) {
				removed = true;
				continue;
			}
			if (newPrivs.length() > 0) {
				newPrivs += ",";
			}
			newPrivs += tok;
		}

		if (removed) {
			/*
			 * If there are no privileges left for this principal, then remove the principal
			 * entry completely from the ACL. We don't store empty ones.
			 */
			if (newPrivs.equals("")) {
				acl.remove(principalNodeId);
			} else {
				ac.setPrvs(newPrivs);
				acl.put(principalNodeId, ac);
			}

			/*
			 * if there are now no acls at all left set the ACL to null, so it is completely
			 * removed from the node
			 */
			if (acl.isEmpty()) {
				node.setAc(null);
			} else {
				node.setAc(acl);
			}

			api.save(session, node);
		}
	}

	/*
	 * Removes the privilege specified in the request from the node specified in the
	 * request
	 */
	public void removePrivilege(MongoSession session, RemovePrivilegeRequest req, RemovePrivilegeResponse res) {
		if (session == null) {
			session = ThreadLocals.getMongoSession();
		}

		String nodeId = req.getNodeId();
		SubNode node = api.getNode(session, nodeId);
		api.authRequireOwnerOfNode(session, node);

		String principalNodeId = req.getPrincipalNodeId();
		String privilege = req.getPrivilege();

		removeAclEntry(session, node, principalNodeId, privilege);
		res.setSuccess(true);
	}

	public List<String> getOwnerNames(MongoSession session, SubNode node) {
		Set<String> ownerSet = new HashSet<String>();
		/*
		 * We walk up the tree util we get to the root, or find ownership on node, or
		 * any of it's parents
		 */

		int sanityCheck = 0;
		while (++sanityCheck < 100) {
			List<MongoPrincipal> principals = getNodePrincipals(session, node);
			for (MongoPrincipal p : principals) {

				/*
				 * todo-3: this is a spot that can be optimized. We should be able to send just
				 * the userNodeId back to client, and the client should be able to deal with
				 * that (i think). depends on how much ownership info we need to show user.
				 * ownerSet.add(p.getUserNodeId());
				 */
				SubNode userNode = api.getNode(session, p.getUserNodeId());
				String userName = userNode.getStringProp(NodeProp.USER.toString());
				ownerSet.add(userName);
			}

			if (principals.size() == 0) {
				node = api.getParent(session, node);
				if (node == null)
					break;
			} else {
				break;
			}
		}

		List<String> ownerList = new LinkedList<String>(ownerSet);
		Collections.sort(ownerList);
		return ownerList;
	}

	public static List<MongoPrincipal> getNodePrincipals(MongoSession session, SubNode node) {
		List<MongoPrincipal> principals = new LinkedList<MongoPrincipal>();
		MongoPrincipal principal = new MongoPrincipal();
		principal.setUserNodeId(node.getId());
		principal.setAccessLevel("w");
		principals.add(principal);
		return principals;
	}
}
